#!/usr/bin/env node
/**
 * Edge Agent - Mac Mini iMessage Relay
 * Phase 2: Transport + Scheduler (monitor, forward, respond, schedule)
 */

import { loadConfig, validateConfig } from './config';
import { Config } from './types/config.types';
import { IncomingMessage } from './types/message.types';
import { Logger } from './utils/logger';
import { AppleScriptTransport } from './transports/AppleScriptTransport';
import { RailwayClient } from './backend/RailwayClient';
import { WebSocketClient } from './backend/WebSocketClient';
import { Scheduler } from './scheduler/Scheduler';
import { CommandHandler } from './commands/CommandHandler';
import { RuleEngine } from './rules/RuleEngine';
import { PlanManager } from './plans/PlanManager';
import { SentryMonitoring } from './monitoring/sentry';
import { AmplitudeAnalytics } from './monitoring/amplitude';
import { HealthCheckServer } from './monitoring/health';
import { v4 as uuidv4 } from 'uuid';
import { EdgeEventWrapper, EdgeCommandWrapper } from './interfaces/ICommands';

/**
 * Main application class
 */
class EdgeAgent {
  private config: Config;
  private logger: Logger;
  private sentry: SentryMonitoring;
  private amplitude: AmplitudeAnalytics;
  private healthCheck: HealthCheckServer;
  private transport: AppleScriptTransport;
  private backend: RailwayClient;
  private wsClient: WebSocketClient;
  private scheduler: Scheduler;
  private ruleEngine: RuleEngine;
  private planManager: PlanManager;
  private commandHandler: CommandHandler;
  private pollInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private startTime: Date = new Date();
  private pendingEvents: EdgeEventWrapper[] = [];
  private lastCommandId: string | null = null;
  private useWebSocket: boolean = true; // Enable WebSocket by default
  private wsMessagesSent: Map<string, Set<string>> = new Map(); // Track all WebSocket-sent messages by thread_id

  // MEMORY LEAK FIX: Track all timers for cleanup
  private activeTimers: Set<NodeJS.Timeout> = new Set();
  private activeIntervals: Set<NodeJS.Timeout> = new Set();

  // MEMORY LEAK FIX: Track timestamps for WebSocket message tracking
  private wsMessagesTimestamps: Map<string, Map<string, number>> = new Map();
  private readonly WS_MESSAGE_TRACKING_MAX_SIZE = 1000;
  private readonly WS_MESSAGE_TRACKING_MAX_AGE_MS = 60000; // 1 minute

  constructor() {
    // Load configuration
    this.config = loadConfig();
    validateConfig(this.config);

    // Initialize logger
    this.logger = new Logger(
      this.config.logging.level,
      this.config.logging.file
    );

    // Initialize monitoring
    this.sentry = new SentryMonitoring(this.config, this.logger);
    this.amplitude = new AmplitudeAnalytics(this.config, this.logger);
    this.healthCheck = new HealthCheckServer(this.config, this.logger);

    // Initialize transport
    this.transport = new AppleScriptTransport(
      this.config.imessage.db_path,
      this.logger
    );

    // Initialize backend client and WebSocket (both use EDGE_SECRET for auth)
    const edgeSecret = process.env.EDGE_SECRET;
    if (!edgeSecret) {
      throw new Error('EDGE_SECRET environment variable is required');
    }

    this.backend = new RailwayClient(
      this.config.backend.url,
      this.config.edge.user_phone,
      edgeSecret,
      this.logger
    );

    this.wsClient = new WebSocketClient(
      this.config.backend.url,
      edgeSecret,
      this.logger
    );

    // Initialize scheduler
    const dbPath = this.config.database?.path || './data/scheduler.db';
    this.scheduler = new Scheduler(dbPath, this.transport, this.logger);

    // Initialize rule engine
    const rulesDbPath = this.config.database?.rules_path || './data/rules.db';
    this.ruleEngine = new RuleEngine(rulesDbPath, this.logger);

    // Initialize plan manager
    const plansDbPath = this.config.database?.plans_path || './data/plans.db';
    this.planManager = new PlanManager(plansDbPath, this.logger);

    // Initialize command handler
    this.commandHandler = new CommandHandler(this.scheduler, this.transport, this.logger, this.ruleEngine, this.planManager);

    // Set up WebSocket callbacks
    this.wsClient.onCommand(async (command) => {
      await this.processCommand(command);
    });

    this.wsClient.onConnected(() => {
      this.logger.info('🔌 WebSocket connected - real-time command delivery enabled');
      this.healthCheck.setWebSocketConnected(true);
      // Reduce or stop HTTP polling when WebSocket is connected
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
        this.logger.info('HTTP polling paused (using WebSocket)');
      }
    });

    this.wsClient.onDisconnected(() => {
      this.logger.warn('🔌 WebSocket disconnected - falling back to HTTP polling');
      this.healthCheck.setWebSocketConnected(false);
      // Resume HTTP polling as fallback
      if (!this.syncInterval && this.isRunning) {
        this.startSyncLoop();
      }
    });

    this.logger.info('Edge Agent initialized with scheduler and WebSocket support');
  }

  /**
   * MEMORY LEAK FIX: Safe setTimeout that tracks timer for cleanup
   */
  private safeSetTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.activeTimers.delete(timer);
      callback();
    }, ms);

    this.activeTimers.add(timer);
    return timer;
  }

  /**
   * MEMORY LEAK FIX: Safe setInterval that tracks timer for cleanup
   */
  private safeSetInterval(callback: () => void, ms: number): NodeJS.Timeout {
    const timer = setInterval(callback, ms);
    this.activeIntervals.add(timer);
    return timer;
  }

  /**
   * MEMORY LEAK FIX: Clean up old WebSocket message tracking entries
   */
  private cleanupOldTrackedMessages(): void {
    const now = Date.now();

    // Age-based cleanup
    for (const [threadId, messages] of this.wsMessagesTimestamps.entries()) {
      for (const [messageText, timestamp] of messages.entries()) {
        if (now - timestamp > this.WS_MESSAGE_TRACKING_MAX_AGE_MS) {
          // Remove from both maps
          this.wsMessagesSent.get(threadId)?.delete(messageText);
          messages.delete(messageText);
        }
      }

      // Clean up empty thread entries
      if (messages.size === 0) {
        this.wsMessagesTimestamps.delete(threadId);
        this.wsMessagesSent.delete(threadId);
      }
    }

    // Size-based eviction (if still too large after age cleanup)
    const totalTracked = Array.from(this.wsMessagesSent.values())
      .reduce((sum, set) => sum + set.size, 0);

    if (totalTracked > this.WS_MESSAGE_TRACKING_MAX_SIZE) {
      this.logger.warn(
        `⚠️  WebSocket message tracking exceeded max size (${totalTracked}/${this.WS_MESSAGE_TRACKING_MAX_SIZE}), clearing oldest entries`
      );

      // Clear oldest 20% of entries
      const entriesToRemove = Math.ceil(totalTracked * 0.2);
      let removed = 0;

      for (const [threadId, messages] of this.wsMessagesTimestamps.entries()) {
        if (removed >= entriesToRemove) break;

        // Sort by timestamp (oldest first)
        const sorted = Array.from(messages.entries())
          .sort((a, b) => a[1] - b[1]);

        for (const [messageText] of sorted) {
          if (removed >= entriesToRemove) break;

          this.wsMessagesSent.get(threadId)?.delete(messageText);
          messages.delete(messageText);
          removed++;
        }
      }

      this.logger.info(`Cleared ${removed} old message tracking entries`);
    }
  }

  /**
   * MEMORY LEAK FIX: Start cleanup interval for tracked messages
   */
  private startMemoryCleanup(): void {
    // Clean up every 30 seconds
    this.safeSetInterval(() => {
      this.cleanupOldTrackedMessages();
    }, 30000);
  }

  /**
   * Start the edge agent
   */
  async start(): Promise<void> {
    try {
      this.logger.info('='.repeat(60));
      this.logger.info('Starting Edge Agent v2.0.0 (Phase 2: Transport + Scheduler)');
      this.logger.info('='.repeat(60));

      // Initialize monitoring
      this.sentry.initialize();
      this.amplitude.initialize();
      this.healthCheck.start();

      // Register with backend
      this.logger.info('Registering with backend...');
      const edgeAgentId = await this.backend.register();
      this.logger.info(`✅ Registered as: ${edgeAgentId}`);

      // Set edge agent ID for WebSocket
      this.wsClient.setEdgeAgentId(edgeAgentId);

      // Start transport
      this.logger.info('Starting iMessage transport...');
      await this.transport.start();
      this.logger.info('✅ Transport ready');

      // Start scheduler
      this.logger.info('Starting scheduler...');
      const schedulerInterval = this.config.scheduler?.check_interval_seconds ?? 30;
      const schedulerAdaptive = this.config.scheduler?.adaptive_mode ?? true;
      this.scheduler.start(schedulerInterval, schedulerAdaptive);
      const stats = this.scheduler.getStats();
      this.logger.info(`✅ Scheduler ready (${stats.pending} pending messages)`);

      // Check backend health
      const healthy = await this.backend.healthCheck();
      if (healthy) {
        this.logger.info('✅ Backend is healthy');
      } else {
        this.logger.warn('⚠️  Backend health check failed');
      }

      // Start message polling loop
      this.isRunning = true;

      // MEMORY LEAK FIX: Start memory cleanup
      this.startMemoryCleanup();

      this.startPolling();

      // Try to connect WebSocket for real-time commands
      if (this.useWebSocket) {
        this.logger.info('Attempting WebSocket connection...');
        const wsConnected = await this.wsClient.connect();

        if (wsConnected) {
          this.logger.info('✅ WebSocket connected - real-time mode enabled');
        } else {
          this.logger.warn('⚠️  WebSocket connection failed - falling back to HTTP polling');
          this.startSyncLoop();
        }
      } else {
        // Start sync loop (HTTP polling fallback)
        this.startSyncLoop();
      }

      this.logger.info('='.repeat(60));
      this.logger.info('✅ Edge Agent is running!');
      this.healthCheck.setRunning(true);
      this.logger.info(`Polling for messages every ${this.config.imessage.poll_interval_seconds}s`);

      if (this.wsClient.isConnected()) {
        this.logger.info('Command delivery: Real-time via WebSocket 🚀');
      } else {
        this.logger.info(`Command delivery: HTTP polling every ${this.config.backend.sync_interval_seconds}s`);
      }

      this.logger.info('Press Ctrl+C to stop');
      this.logger.info('='.repeat(60));
    } catch (error: any) {
      this.logger.error('Failed to start edge agent:', error.message);
      throw error;
    }
  }

  /**
   * Start polling for messages
   */
  private startPolling(): void {
    const pollIntervalMs = this.config.imessage.poll_interval_seconds * 1000;

    // Poll immediately
    this.pollMessages();

    // Then poll on interval (using safe interval tracking)
    this.pollInterval = this.safeSetInterval(() => {
      this.pollMessages();
    }, pollIntervalMs);
  }

  /**
   * Poll for new messages and process them
   */
  private async pollMessages(): Promise<void> {
    try {
      // Get new messages from transport
      const messages = await this.transport.pollNewMessages();

      if (messages.length === 0) {
        return;
      }

      this.logger.info(`📬 Processing ${messages.length} new message(s)`);

      // OPTIMIZATION: Process messages in parallel (up to 3 concurrent)
      // Improves throughput 2-3× when multiple messages arrive together
      const concurrency = 3;
      for (let i = 0; i < messages.length; i += concurrency) {
        const batch = messages.slice(i, i + concurrency);
        await Promise.all(batch.map(message => this.processMessage(message)));
      }
    } catch (error: any) {
      this.logger.error('Error polling messages:', error.message);
    }
  }

  /**
   * Process a single message
   */
  private async processMessage(message: IncomingMessage): Promise<void> {
    try {
      this.logger.info('='.repeat(60));
      this.logger.info(`📨 INCOMING MESSAGE from ${message.sender}`);
      this.logger.info(`   Thread: ${message.threadId}`);
      this.logger.info(`   Group: ${message.isGroup ? 'Yes' : 'No'}`);
      this.logger.info(`   Text: "${message.text}"`);
      this.logger.info('='.repeat(60));

      // Send to backend for processing
      this.logger.info(`⬆️  SENDING TO BACKEND: ${this.config.backend.url}/edge/message`);
      const response = await this.backend.sendMessage({
        thread_id: message.threadId,
        sender: message.sender,
        filtered_text: message.text,
        original_timestamp: message.timestamp.toISOString(),
        is_group: message.isGroup,
        participants: message.participants,
        was_redacted: false,
        redacted_fields: [],
        filter_reason: 'phase1_transport'
      });
      this.logger.info(`⬇️  BACKEND RESPONSE: should_respond=${response.should_respond}`);

      // Send response if backend wants us to
      if (response.should_respond) {
        // Get already-sent messages for this thread
        const wsSentMessages = this.wsMessagesSent.get(message.threadId);

        // NEW: Check for reflex/burst split (fast path)
        if (response.reflex_message) {
          // Check if reflex message was already sent via WebSocket
          if (wsSentMessages && wsSentMessages.has(response.reflex_message)) {
            this.logger.info(`⏭️  Skipping reflex message (already sent via WebSocket)`);
          } else {
            this.logger.info('-'.repeat(60));
            this.logger.info(`⚡ SENDING REFLEX MESSAGE to ${message.threadId}`);
            this.logger.info(`   Text: "${response.reflex_message}"`);
            this.logger.info('-'.repeat(60));

            const reflexSent = await this.transport.sendMessage(
              message.threadId,
              response.reflex_message,
              message.isGroup
            );

            if (reflexSent) {
              this.logger.info('✅ Reflex message DELIVERED to iMessage');
            } else {
              this.logger.error('❌ FAILED to deliver reflex message to iMessage');
            }
          }

          // Send burst messages after delay (if any)
          if (response.burst_messages && response.burst_messages.length > 0) {
            // Filter out any burst messages already sent via WebSocket
            let burstToSend = response.burst_messages;
            if (wsSentMessages && wsSentMessages.size > 0) {
              const originalCount = burstToSend.length;
              burstToSend = burstToSend.filter(msg => !wsSentMessages.has(msg));
              const skippedCount = originalCount - burstToSend.length;

              if (skippedCount > 0) {
                this.logger.info(`⏭️  Skipping ${skippedCount} burst message${skippedCount > 1 ? 's' : ''} (already sent via WebSocket)`);
              }
            }

            if (burstToSend.length === 0) {
              this.logger.info('ℹ️  All burst messages already sent via WebSocket');
            } else {
              const delayMs = response.burst_delay_ms || 2000;
              this.logger.info(`⏳ Will send ${burstToSend.length} burst messages after ${delayMs}ms`);
              this.logger.info(`   Burst messages: ${JSON.stringify(burstToSend)}`);

              setTimeout(async () => {
                this.logger.info('-'.repeat(60));
                this.logger.info(`📤 SENDING BURST MESSAGES to ${message.threadId}`);
                for (let i = 0; i < burstToSend.length; i++) {
                  this.logger.info(`   [${i + 1}/${burstToSend.length}]: "${burstToSend[i]}"`);
                }
                this.logger.info('-'.repeat(60));

                const burstSent = await this.transport.sendMultiBubble(
                  message.threadId,
                  burstToSend,
                  message.isGroup
                );

                if (burstSent) {
                  this.logger.info('✅ All burst messages DELIVERED to iMessage');
                } else {
                  this.logger.error('❌ FAILED to deliver burst messages to iMessage');
                }
              }, delayMs);
            }
          }
        }
        // Legacy multi-bubble response
        else if (response.reply_bubbles && response.reply_bubbles.length > 0) {
          // Filter out any bubbles already sent via WebSocket
          let bubblesToSend = response.reply_bubbles;

          if (wsSentMessages && wsSentMessages.size > 0) {
            const originalCount = bubblesToSend.length;
            bubblesToSend = bubblesToSend.filter(bubble => !wsSentMessages.has(bubble));
            const skippedCount = originalCount - bubblesToSend.length;

            if (skippedCount > 0) {
              this.logger.info(`⏭️  Skipping ${skippedCount} bubble${skippedCount > 1 ? 's' : ''} (already sent via WebSocket)`);
            }
          }

          if (bubblesToSend.length === 0) {
            this.logger.info('ℹ️  All bubbles already sent via WebSocket');
          } else {
            this.logger.info('-'.repeat(60));
            this.logger.info(`📤 SENDING ${bubblesToSend.length} BUBBLES to ${message.threadId}`);
            for (let i = 0; i < bubblesToSend.length; i++) {
              this.logger.info(`   [${i + 1}/${bubblesToSend.length}]: "${bubblesToSend[i]}"`);
            }
            this.logger.info('-'.repeat(60));

            const sent = await this.transport.sendMultiBubble(
              message.threadId,
              bubblesToSend,
              message.isGroup
            );

            if (sent) {
              this.logger.info('✅ All bubbles DELIVERED to iMessage');
            } else {
              this.logger.error('❌ FAILED to deliver bubbles to iMessage');
            }
          }
        }
        // Legacy single bubble
        else if (response.reply_text) {
          // Check if message was already sent via WebSocket
          if (wsSentMessages && wsSentMessages.has(response.reply_text)) {
            this.logger.info(`⏭️  Skipping message (already sent via WebSocket)`);
          } else {
            this.logger.info('-'.repeat(60));
            this.logger.info(`📤 SENDING RESPONSE to ${message.threadId}`);
            this.logger.info(`   Text: "${response.reply_text}"`);
            this.logger.info('-'.repeat(60));

            const sent = await this.transport.sendMessage(
              message.threadId,
              response.reply_text,
              message.isGroup
            );

            if (sent) {
              this.logger.info('✅ Response DELIVERED to iMessage');
            } else {
              this.logger.error('❌ FAILED to deliver response to iMessage');
            }
          }
        }

        // Clean up tracking for this thread after processing HTTP response
        if (wsSentMessages) {
          this.wsMessagesSent.delete(message.threadId);
        }
      } else {
        this.logger.info('ℹ️  Backend did not request a response');
      }
    } catch (error: any) {
      this.logger.error('Error processing message:', error.message);
    }
  }

  /**
   * Start sync loop with backend
   */
  private startSyncLoop(): void {
    const syncIntervalMs = this.config.backend.sync_interval_seconds * 1000;

    // Sync immediately
    this.syncWithBackend();

    // Then sync on interval (using safe interval tracking)
    this.syncInterval = this.safeSetInterval(() => {
      this.syncWithBackend();
    }, syncIntervalMs);
  }

  /**
   * Sync with backend - send events and receive commands
   */
  private async syncWithBackend(): Promise<void> {
    try {
      const edgeAgentId = this.backend.getEdgeAgentId();
      if (!edgeAgentId) {
        this.logger.warn('Cannot sync - no edge agent ID');
        return;
      }

      // Get current stats
      const stats = this.scheduler.getStats();
      const uptimeSeconds = Math.floor((new Date().getTime() - this.startTime.getTime()) / 1000);

      // Prepare sync request
      const syncRequest = {
        edge_agent_id: edgeAgentId,
        last_command_id: this.lastCommandId,
        pending_events: this.pendingEvents,
        status: {
          scheduled_messages: stats.pending,
          active_rules: this.commandHandler.getActiveRulesCount(),
          uptime_seconds: uptimeSeconds
        }
      };

      // Sync with backend
      const response = await this.backend.sync(syncRequest);

      // Clear acknowledged events
      if (response.ack_events.length > 0) {
        this.pendingEvents = this.pendingEvents.filter(
          event => !response.ack_events.includes(event.event_id)
        );
        this.logger.debug(`Cleared ${response.ack_events.length} acknowledged events`);
      }

      // Process commands
      if (response.commands.length > 0) {
        this.logger.info(`📥 Received ${response.commands.length} command(s) from backend`);

        for (const command of response.commands) {
          await this.processCommand(command);
        }
      }

      // Apply config updates if any
      if (response.config_updates) {
        this.applyConfigUpdates(response.config_updates);
      }
    } catch (error: any) {
      this.logger.error('Error syncing with backend:', error.message);
    }
  }

  /**
   * Process a command from the backend
   */
  private async processCommand(command: EdgeCommandWrapper): Promise<void> {
    try {
      // Log command priority if specified
      if (command.priority === 'immediate') {
        this.logger.info(`⚡ Processing IMMEDIATE priority command ${command.command_id}`);
      }

      // Track message BEFORE execution to prevent race conditions with HTTP response
      let threadId: string | null = null;
      let messageText: string | null = null;

      // Extract thread_id and message text from different command types
      if (command.command_type === 'send_message_now') {
        threadId = command.payload.thread_id;
        messageText = command.payload.text;
      } else if (command.command_type === 'schedule_message') {
        threadId = command.payload.thread_id;
        messageText = command.payload.message_text;
      }

      // Track the message for deduplication IMMEDIATELY (before execution)
      // MEMORY LEAK FIX: Now uses timestamp-based tracking instead of individual timers
      if (threadId && messageText) {
        // Initialize tracking structures
        if (!this.wsMessagesSent.has(threadId)) {
          this.wsMessagesSent.set(threadId, new Set());
          this.wsMessagesTimestamps.set(threadId, new Map());
        }

        // Track message with timestamp
        this.wsMessagesSent.get(threadId)!.add(messageText);
        this.wsMessagesTimestamps.get(threadId)!.set(messageText, Date.now());

        this.logger.info(`📝 Pre-tracking WebSocket message for ${threadId}: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`);

        // Cleanup happens in periodic cleanupOldTrackedMessages() instead of individual timeouts
      }

      // Execute command
      const result = await this.commandHandler.executeCommand(command);

      // Update last command ID
      this.lastCommandId = command.command_id;

      // Acknowledge command via WebSocket if connected, otherwise HTTP
      const ackSent = this.wsClient.isConnected()
        ? this.wsClient.sendCommandAck(
            command.command_id,
            result.success ? 'completed' : 'failed',
            result.error
          )
        : false;

      // Fallback to HTTP acknowledgment if WebSocket unavailable
      if (!ackSent) {
        await this.backend.acknowledgeCommand(
          command.command_id,
          result.success,
          result.error
        );
      }

      if (result.success) {
        this.logger.info(`✅ Command ${command.command_id} executed successfully`);
      } else {
        this.logger.error(`❌ Command ${command.command_id} failed: ${result.error}`);
      }
    } catch (error: any) {
      this.logger.error(`Error processing command ${command.command_id}:`, error.message);

      // Acknowledge failure via WebSocket if connected, otherwise HTTP
      const ackSent = this.wsClient.isConnected()
        ? this.wsClient.sendCommandAck(command.command_id, 'failed', error.message)
        : false;

      if (!ackSent) {
        await this.backend.acknowledgeCommand(
          command.command_id,
          false,
          error.message
        );
      }
    }
  }

  /**
   * Apply config updates from backend
   */
  private applyConfigUpdates(updates: { sync_interval?: number; [key: string]: any }): void {
    if (updates.sync_interval) {
      this.logger.info(`Updating sync interval to ${updates.sync_interval}s`);
      this.config.backend.sync_interval_seconds = updates.sync_interval;

      // Restart sync loop with new interval
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.startSyncLoop();
      }
    }
  }

  /**
   * Add an event to send to backend
   */
  private addEvent(eventType: string, threadId: string | undefined, details: Record<string, any>): void {
    const event: EdgeEventWrapper = {
      event_id: uuidv4(),
      event_type: eventType,
      thread_id: threadId,
      details
    };

    this.pendingEvents.push(event);
  }

  /**
   * Stop the edge agent
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping Edge Agent...');

    this.isRunning = false;

    // Flush monitoring events before shutdown
    await this.sentry.flush();
    await this.amplitude.flush();

    // MEMORY LEAK FIX: Clear all tracked intervals
    this.activeIntervals.forEach(interval => {
      clearInterval(interval);
    });
    this.activeIntervals.clear();

    // MEMORY LEAK FIX: Clear all tracked timeouts
    this.activeTimers.forEach(timer => {
      clearTimeout(timer);
    });
    this.activeTimers.clear();

    // Clear legacy interval references (already tracked in activeIntervals)
    this.pollInterval = null;
    this.syncInterval = null;

    // MEMORY LEAK FIX: Clear WebSocket message tracking
    this.wsMessagesSent.clear();
    this.wsMessagesTimestamps.clear();

    // Disconnect WebSocket
    this.wsClient.disconnect();

    this.scheduler.stop();
    this.transport.stop();

    // Close monitoring
    this.healthCheck.stop();
    await this.sentry.close();
    await this.amplitude.shutdown();

    this.logger.info('✅ Edge Agent stopped (cleaned up all timers and tracking)');
  }
}

/**
 * Main entry point
 */
async function main() {
  const agent = new EdgeAgent();

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.log('\n\nReceived SIGINT, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n\nReceived SIGTERM, shutting down gracefully...');
    await agent.stop();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await agent.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', async (error) => {
    console.error('Unhandled rejection:', error);
    await agent.stop();
    process.exit(1);
  });

  // Start the agent
  try {
    await agent.start();
  } catch (error) {
    console.error('Failed to start edge agent:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

export { EdgeAgent };
