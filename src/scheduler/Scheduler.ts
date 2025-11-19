import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { ILogger } from '../interfaces/ILogger';
import { IMessageTransport } from '../interfaces/IMessageTransport';
import { AmplitudeAnalytics } from '../monitoring/amplitude';

/**
 * Scheduled message interface
 */
export interface ScheduledMessage {
  id: string;
  thread_id: string;
  message_text: string;
  send_at: Date;
  is_group: boolean;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  created_at: Date;
  command_id?: string;
  error_message?: string;
}

/**
 * Scheduler - Local message scheduling and execution
 * Stores scheduled messages in SQLite and executes them at the right time
 */
export class Scheduler {
  private db: Database.Database;
  private logger: ILogger;
  private transport: IMessageTransport;
  private amplitude: AmplitudeAnalytics | null = null;
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private adaptiveMode: boolean = true; // Phase 3: Adaptive scheduling
  private maxCheckIntervalMs: number = 60000; // Max 60s between checks
  private checkBufferMs: number = 100; // Check 100ms before message is due

  constructor(
    dbPath: string,
    transport: IMessageTransport,
    logger: ILogger,
    amplitude?: AmplitudeAnalytics
  ) {
    this.logger = logger;
    this.transport = transport;
    this.amplitude = amplitude || null;

    // Initialize database
    this.db = new Database(dbPath);
    this.initDatabase();

    this.logger.info('Scheduler initialized');
  }

  /**
   * Initialize database schema
   */
  private initDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        message_text TEXT NOT NULL,
        send_at DATETIME NOT NULL,
        is_group INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        command_id TEXT,
        error_message TEXT
      )
    `);

    // Create index for efficient queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_send_at
      ON scheduled_messages(send_at)
      WHERE status = 'pending'
    `);

    this.logger.info('Scheduler database initialized');
  }

  /**
   * Schedule a new message
   */
  scheduleMessage(
    threadId: string,
    messageText: string,
    sendAt: Date,
    isGroup: boolean = false,
    commandId?: string
  ): string {
    const id = uuidv4();

    const stmt = this.db.prepare(`
      INSERT INTO scheduled_messages
      (id, thread_id, message_text, send_at, is_group, command_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      threadId,
      messageText,
      sendAt.toISOString(),
      isGroup ? 1 : 0,
      commandId || null
    );

    this.logger.info(`Scheduled message ${id} for ${sendAt.toISOString()}`);

    // Track scheduled message
    if (this.amplitude) {
      this.amplitude.trackScheduledMessage(sendAt.toISOString(), true);
    }

    // Reschedule next check if in adaptive mode and scheduler is running
    // This ensures newly added messages don't wait for the current timeout
    if (this.adaptiveMode && this.isRunning) {
      this.scheduleNextCheck();
    }

    return id;
  }

  /**
   * Cancel a scheduled message
   */
  cancelMessage(scheduleId: string): boolean {
    const stmt = this.db.prepare(`
      UPDATE scheduled_messages
      SET status = 'cancelled'
      WHERE id = ? AND status = 'pending'
    `);

    const result = stmt.run(scheduleId);

    if (result.changes > 0) {
      this.logger.info(`Cancelled scheduled message ${scheduleId}`);
      return true;
    } else {
      this.logger.warn(`Failed to cancel message ${scheduleId} (not found or already sent)`);
      return false;
    }
  }

  /**
   * Get a scheduled message by ID
   */
  getMessage(scheduleId: string): ScheduledMessage | null {
    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_messages WHERE id = ?
    `);

    const row = stmt.get(scheduleId) as any;

    if (!row) {
      return null;
    }

    return this.rowToMessage(row);
  }

  /**
   * Get all pending scheduled messages
   */
  getPendingMessages(): ScheduledMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_messages
      WHERE status = 'pending'
      ORDER BY send_at ASC
    `);

    const rows = stmt.all() as any[];

    return rows.map(row => this.rowToMessage(row));
  }

  /**
   * Get all scheduled messages (for admin interface)
   */
  getAllScheduled(): ScheduledMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_messages
      ORDER BY created_at DESC
      LIMIT 100
    `);

    const rows = stmt.all() as any[];

    return rows.map(row => this.rowToMessage(row));
  }

  /**
   * Cancel a scheduled message (alias for cancelMessage for admin interface)
   */
  cancel(scheduleId: string): boolean {
    return this.cancelMessage(scheduleId);
  }

  /**
   * Get the next pending message time (for adaptive scheduling)
   */
  private getNextMessageTime(): Date | null {
    const stmt = this.db.prepare(`
      SELECT send_at FROM scheduled_messages
      WHERE status = 'pending'
      ORDER BY send_at ASC
      LIMIT 1
    `);

    const row = stmt.get() as any;
    return row ? new Date(row.send_at) : null;
  }

  /**
   * Calculate when to check next (adaptive mode)
   * Returns milliseconds until next check
   */
  private calculateNextCheckInterval(): number {
    const nextMessageTime = this.getNextMessageTime();

    if (!nextMessageTime) {
      // No pending messages, use max interval
      return this.maxCheckIntervalMs;
    }

    const now = new Date();
    const timeUntilDue = nextMessageTime.getTime() - now.getTime();

    if (timeUntilDue <= 0) {
      // Message is already due, check immediately
      return 0;
    }

    // Check slightly before the message is due (with buffer)
    const checkTime = Math.max(timeUntilDue - this.checkBufferMs, 0);

    // Cap at max interval to catch any newly added messages
    return Math.min(checkTime, this.maxCheckIntervalMs);
  }

  /**
   * Schedule the next check (adaptive mode)
   */
  private scheduleNextCheck(): void {
    if (!this.isRunning || !this.adaptiveMode) {
      return;
    }

    // Clear any existing timeout
    if (this.checkInterval) {
      clearTimeout(this.checkInterval);
      this.checkInterval = null;
    }

    const intervalMs = this.calculateNextCheckInterval();
    const nextMessageTime = this.getNextMessageTime();

    // Always use at least a 10ms delay to prevent infinite loops
    const safeIntervalMs = Math.max(intervalMs, 10);

    if (nextMessageTime) {
      this.logger.debug(
        `Next message due at ${nextMessageTime.toISOString()} ` +
        `(checking in ${Math.round(safeIntervalMs / 1000)}s)`
      );
    } else {
      this.logger.debug(
        `No pending messages, checking again in ${Math.round(safeIntervalMs / 1000)}s`
      );
    }

    this.checkInterval = setTimeout(() => {
      this.checkAndSendMessages();
    }, safeIntervalMs);
  }

  /**
   * Start the scheduler loop
   */
  start(checkIntervalSeconds: number = 30, adaptiveMode: boolean = true): void {
    this.adaptiveMode = adaptiveMode;
    if (this.isRunning) {
      this.logger.warn('Scheduler already running');
      return;
    }

    this.isRunning = true;

    if (this.adaptiveMode) {
      this.logger.info('🚀 Starting scheduler in ADAPTIVE mode (Phase 3)');
      this.logger.info(`   → Near-instant delivery (<100ms of scheduled time)`);
      this.logger.info(`   → Max check interval: ${this.maxCheckIntervalMs / 1000}s`);

      // Check immediately for any due messages
      this.checkAndSendMessages();
    } else {
      // Legacy fixed-interval mode
      this.logger.info(`Starting scheduler in fixed-interval mode (checking every ${checkIntervalSeconds}s)`);

      // Check immediately
      this.checkAndSendMessages();

      // Then check on fixed interval
      this.checkInterval = setInterval(() => {
        this.checkAndSendMessages();
      }, checkIntervalSeconds * 1000);
    }
  }

  /**
   * Stop the scheduler loop
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping scheduler');
    this.isRunning = false;

    if (this.checkInterval) {
      if (this.adaptiveMode) {
        clearTimeout(this.checkInterval);
      } else {
        clearInterval(this.checkInterval);
      }
      this.checkInterval = null;
    }
  }

  /**
   * Manually trigger immediate check for due messages (public method)
   * Used when immediate priority messages are scheduled
   */
  async checkNow(): Promise<void> {
    await this.checkAndSendMessages();
  }

  /**
   * Check for messages to send and execute them
   * FIXED: Atomic SELECT + mark prevents duplicate sends when multiple checkNow() calls overlap
   */
  private async checkAndSendMessages(): Promise<void> {
    try {
      const now = new Date();

      // Get messages that are due
      const stmt = this.db.prepare(`
        SELECT * FROM scheduled_messages
        WHERE send_at <= ? AND status = 'pending'
        ORDER BY send_at ASC
      `);

      const rows = stmt.all(now.toISOString()) as any[];

      if (rows.length === 0) {
        // No messages due, schedule next check (adaptive mode)
        if (this.adaptiveMode) {
          this.scheduleNextCheck();
        }
        return;
      }

      this.logger.info(`⏰ Found ${rows.length} scheduled message(s) to send`);

      // Process each message
      // ATOMIC CLAIM: Mark each message as 'sent' BEFORE sending to prevent duplicates
      for (const row of rows) {
        // Atomically claim this message by updating status from pending → sent
        // If another concurrent checkNow() already claimed it, this UPDATE will affect 0 rows
        const claimStmt = this.db.prepare(`
          UPDATE scheduled_messages
          SET status = 'sent'
          WHERE id = ? AND status = 'pending'
        `);

        const claimed = claimStmt.run(row.id);

        if (claimed.changes === 0) {
          // Another concurrent execution already claimed this message, skip it
          this.logger.debug(`Message ${row.id} already claimed by another execution`);
          continue;
        }

        // We successfully claimed it, now send it
        const message = this.rowToMessage(row);
        await this.executeSendMessage(message);
      }

      // After sending messages, schedule next check (adaptive mode)
      if (this.adaptiveMode) {
        this.scheduleNextCheck();
      }
    } catch (error: any) {
      this.logger.error('Error checking scheduled messages:', error.message);

      // Even on error, schedule next check (adaptive mode)
      if (this.adaptiveMode) {
        this.scheduleNextCheck();
      }
    }
  }

  /**
   * Execute a scheduled message (already atomically claimed as 'sent')
   */
  private async executeSendMessage(message: ScheduledMessage): Promise<void> {
    const actualTime = new Date();
    const scheduledTime = new Date(message.send_at);
    const latencyMs = actualTime.getTime() - scheduledTime.getTime();

    try {
      this.logger.info('='.repeat(60));
      this.logger.info(`🔔 SENDING SCHEDULED MESSAGE`);
      this.logger.info(`   Schedule ID: ${message.id}`);
      this.logger.info(`   Thread: ${message.thread_id}`);
      this.logger.info(`   Scheduled for: ${message.send_at.toISOString()}`);
      this.logger.info(`   Text: "${message.message_text}"`);
      if (message.command_id) {
        this.logger.info(`   Command ID: ${message.command_id}`);
      }
      this.logger.info('='.repeat(60));

      // Send via transport (status is already 'sent' in database)
      const success = await this.transport.sendMessage(
        message.thread_id,
        message.message_text,
        message.is_group
      );

      // Track scheduled message execution
      if (this.amplitude) {
        this.amplitude.trackScheduledMessageExecuted(
          parseInt(message.id.replace(/-/g, '').substring(0, 8), 16), // Simple numeric ID from UUID
          scheduledTime.toISOString(),
          actualTime.toISOString(),
          latencyMs,
          success
        );
      }

      if (success) {
        this.logger.info(`✅ Scheduled message ${message.id} sent successfully`);
      } else {
        // Mark as failed (even though we claimed it as 'sent' earlier)
        const updateStmt = this.db.prepare(`
          UPDATE scheduled_messages
          SET status = 'failed', error_message = ?
          WHERE id = ?
        `);
        updateStmt.run('Failed to send via transport', message.id);

        this.logger.error(`❌ Failed to send scheduled message ${message.id}`);
      }
    } catch (error: any) {
      // Mark as failed with error
      const updateStmt = this.db.prepare(`
        UPDATE scheduled_messages
        SET status = 'failed', error_message = ?
        WHERE id = ?
      `);
      updateStmt.run(error.message, message.id);

      this.logger.error(`Error executing scheduled message ${message.id}:`, error.message);
    }
  }

  /**
   * Get statistics about scheduled messages
   * OPTIMIZED: Single query instead of 4 separate queries (75% faster)
   */
  getStats(): {
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
  } {
    const stmt = this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM scheduled_messages
      GROUP BY status
    `);

    const rows = stmt.all() as any[];
    const stats = {
      pending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0
    };

    rows.forEach(row => {
      if (row.status in stats) {
        stats[row.status as keyof typeof stats] = row.count;
      }
    });

    return stats;
  }

  /**
   * Convert database row to ScheduledMessage object
   */
  private rowToMessage(row: any): ScheduledMessage {
    return {
      id: row.id,
      thread_id: row.thread_id,
      message_text: row.message_text,
      send_at: new Date(row.send_at),
      is_group: row.is_group === 1,
      status: row.status,
      created_at: new Date(row.created_at),
      command_id: row.command_id || undefined,
      error_message: row.error_message || undefined
    };
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.stop();
    this.db.close();
    this.logger.info('Scheduler closed');
  }
}
