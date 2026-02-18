import { ILogger } from '../interfaces/ILogger';

export interface QueuedMessage {
  id: string;
  threadId: string;
  text?: string;
  bubbles?: string[];
  isGroup: boolean;
  batched?: boolean;
  addedAt: number;
  attempts: number;
  lastAttemptAt?: number;
  /** Optional callback invoked after successful delivery */
  onDelivered?: () => void;
}

export interface SendQueueConfig {
  /** Max items waiting to be sent (default 500) */
  maxQueueSize: number;
  /** Max retry attempts per message (default 3) */
  maxRetries: number;
  /** Base delay between retries in ms — doubles each attempt (default 2000) */
  retryBaseDelayMs: number;
  /** How long a message can sit in the queue before being dropped, in ms (default 120000 = 2 min) */
  ttlMs: number;
  /** How often the queue processor runs, in ms (default 200) */
  drainIntervalMs: number;
}

const DEFAULT_CONFIG: SendQueueConfig = {
  maxQueueSize: 500,
  maxRetries: 3,
  retryBaseDelayMs: 2000,
  ttlMs: 120_000,
  drainIntervalMs: 200,
};

type SendFn = (threadId: string, text: string, isGroup: boolean) => Promise<boolean>;
type SendMultiFn = (threadId: string, bubbles: string[], isGroup: boolean, batched?: boolean) => Promise<boolean>;

/**
 * SendQueue - Buffered, retrying outbound message queue.
 *
 * Sits between the EdgeAgent and the underlying transport (AppleScriptSender).
 * When the transport rate-limits or temporarily fails, messages are held in a
 * FIFO queue and retried with exponential back-off instead of being silently
 * dropped.
 *
 * Design constraints:
 *  - In-memory only (no persistence). If the process crashes, queued messages
 *    are lost. This is acceptable because the backend can resend commands.
 *  - One message is dequeued at a time to respect rate limits.
 *  - Messages that exceed TTL or maxRetries are dropped with a warning.
 */
export class SendQueue {
  private queue: QueuedMessage[] = [];
  private config: SendQueueConfig;
  private logger: ILogger;
  private sendFn: SendFn;
  private sendMultiFn: SendMultiFn;
  private drainTimer: NodeJS.Timeout | null = null;
  private processing = false;
  private idCounter = 0;

  // Metrics
  private totalEnqueued = 0;
  private totalDelivered = 0;
  private totalDropped = 0;

  constructor(
    sendFn: SendFn,
    sendMultiFn: SendMultiFn,
    logger: ILogger,
    config?: Partial<SendQueueConfig>
  ) {
    this.sendFn = sendFn;
    this.sendMultiFn = sendMultiFn;
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the background drain loop.
   */
  start(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => this.drain(), this.config.drainIntervalMs);
    this.logger.info(`📤 SendQueue started (max=${this.config.maxQueueSize}, retries=${this.config.maxRetries}, ttl=${this.config.ttlMs}ms)`);
  }

  /**
   * Stop the drain loop and clear the queue.
   */
  stop(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
    const remaining = this.queue.length;
    this.queue = [];
    if (remaining > 0) {
      this.logger.warn(`📤 SendQueue stopped — dropped ${remaining} queued message(s)`);
    }
  }

  /**
   * Enqueue a single-bubble message.
   * Returns false if the queue is full (caller should handle gracefully).
   */
  enqueue(threadId: string, text: string, isGroup: boolean, onDelivered?: () => void): boolean {
    if (this.queue.length >= this.config.maxQueueSize) {
      this.logger.error(`❌ SendQueue full (${this.config.maxQueueSize}), dropping message for ${threadId}`);
      this.totalDropped++;
      return false;
    }

    const msg: QueuedMessage = {
      id: `sq_${++this.idCounter}`,
      threadId,
      text,
      isGroup,
      addedAt: Date.now(),
      attempts: 0,
      onDelivered,
    };

    this.queue.push(msg);
    this.totalEnqueued++;
    this.logger.debug(`📤 Enqueued message ${msg.id} for ${threadId} (queue depth: ${this.queue.length})`);
    return true;
  }

  /**
   * Enqueue a multi-bubble message.
   */
  enqueueMultiBubble(
    threadId: string,
    bubbles: string[],
    isGroup: boolean,
    batched: boolean = true,
    onDelivered?: () => void
  ): boolean {
    if (this.queue.length >= this.config.maxQueueSize) {
      this.logger.error(`❌ SendQueue full (${this.config.maxQueueSize}), dropping multi-bubble for ${threadId}`);
      this.totalDropped++;
      return false;
    }

    const msg: QueuedMessage = {
      id: `sq_${++this.idCounter}`,
      threadId,
      bubbles,
      isGroup,
      batched,
      addedAt: Date.now(),
      attempts: 0,
      onDelivered,
    };

    this.queue.push(msg);
    this.totalEnqueued++;
    this.logger.debug(`📤 Enqueued multi-bubble ${msg.id} (${bubbles.length} bubbles) for ${threadId} (queue depth: ${this.queue.length})`);
    return true;
  }

  /**
   * Drain loop — processes one message at a time from the front of the queue.
   */
  private async drain(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    try {
      const now = Date.now();
      const msg = this.queue[0];

      // Drop expired messages
      if (now - msg.addedAt > this.config.ttlMs) {
        this.queue.shift();
        this.totalDropped++;
        this.logger.warn(`⏰ SendQueue: message ${msg.id} expired after ${this.config.ttlMs}ms (thread: ${msg.threadId})`);
        return;
      }

      // Respect exponential back-off between retries
      if (msg.attempts > 0 && msg.lastAttemptAt) {
        const backoff = this.config.retryBaseDelayMs * Math.pow(2, msg.attempts - 1);
        if (now - msg.lastAttemptAt < backoff) {
          return; // Not time to retry yet
        }
      }

      // Attempt delivery
      msg.attempts++;
      msg.lastAttemptAt = now;

      let success = false;
      try {
        if (msg.bubbles) {
          success = await this.sendMultiFn(msg.threadId, msg.bubbles, msg.isGroup, msg.batched);
        } else if (msg.text) {
          success = await this.sendFn(msg.threadId, msg.text, msg.isGroup);
        }
      } catch (err: any) {
        // Rate limit or validation errors come as thrown exceptions
        if (err.message?.includes('Rate limit')) {
          this.logger.warn(`⚠️  SendQueue: rate-limited on ${msg.id}, will retry (attempt ${msg.attempts}/${this.config.maxRetries})`);
        } else {
          this.logger.error(`❌ SendQueue: send error on ${msg.id}: ${err.message}`);
        }
        success = false;
      }

      if (success) {
        this.queue.shift();
        this.totalDelivered++;
        this.logger.debug(`✅ SendQueue: delivered ${msg.id} to ${msg.threadId} (attempt ${msg.attempts})`);
        msg.onDelivered?.();
      } else if (msg.attempts >= this.config.maxRetries) {
        this.queue.shift();
        this.totalDropped++;
        this.logger.error(`❌ SendQueue: giving up on ${msg.id} after ${msg.attempts} attempts (thread: ${msg.threadId})`);
      }
      // else: leave in queue for next drain cycle with back-off
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get queue stats for monitoring / health checks.
   */
  getStats(): {
    depth: number;
    totalEnqueued: number;
    totalDelivered: number;
    totalDropped: number;
  } {
    return {
      depth: this.queue.length,
      totalEnqueued: this.totalEnqueued,
      totalDelivered: this.totalDelivered,
      totalDropped: this.totalDropped,
    };
  }
}
