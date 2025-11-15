#!/usr/bin/env node
/**
 * Edge Agent - Mac Mini iMessage Relay
 * Phase 2: Transport + Scheduler (monitor, forward, respond, schedule)
 */

import { loadConfig, validateConfig } from './config';
import { Logger } from './utils/logger';
import { AppleScriptTransport } from './transports/AppleScriptTransport';
import { RailwayClient } from './backend/RailwayClient';
import { WebSocketClient } from './backend/WebSocketClient';
import { Scheduler } from './scheduler/Scheduler';
import { CommandHandler } from './commands/CommandHandler';
import { RuleEngine } from './rules/RuleEngine';
import { PlanManager } from './plans/PlanManager';
import { v4 as uuidv4 } from 'uuid';
import { EdgeEventWrapper } from './interfaces/ICommands';

/**
 * Main application class
 */
class EdgeAgent {
  private config: any;
  private logger: Logger;
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
  private wsReflexSent: Map<string, { text: string; timestamp: number }> = new Map(); // Track WebSocket-sent reflex messages

  constructor() {
    // Load configuration
    this.config = loadConfig();
    validateConfig(this.config);

    // Initialize logger
    this.logger = new Logger(
      this.config.logging.level,
      this.config.logging.file
    );

    // Initialize transport
    this.transport = new AppleScriptTransport(
      this.config.imessage.db_path,
      this.logger
    );

    // Initialize backend client (Railway with Bearer auth)
    const relaySecret = process.env.RELAY_WEBHOOK_SECRET;
    if (!relaySecret) {
      throw new Error('RELAY_WEBHOOK_SECRET environment variable is required');
    }
    this.backend = new RailwayClient(
      this.config.backend.url,
      this.config.edge.user_phone,
      relaySecret,
      this.logger
    );

    // Initialize WebSocket client (uses EDGE_SECRET for auth)
    const edgeSecret = process.env.EDGE_SECRET;
    if (!edgeSecret) {
      throw new Error('EDGE_SECRET environment variable is required for WebSocket');
    }
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
      // Reduce or stop HTTP polling when WebSocket is connected
      if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
        this.logger.info('HTTP polling paused (using WebSocket)');
      }
    });

    this.wsClient.onDisconnected(() => {
      this.logger.warn('🔌 WebSocket disconnected - falling back to HTTP polling');
      // Resume HTTP polling as fallback
      if (!this.syncInterval && this.isRunning) {
        this.startSyncLoop();
      }
    });

    this.logger.info('Edge Agent initialized with scheduler and WebSocket support');
  }

  /**
   * Start the edge agent
   */
  async start(): Promise<void> {
    try {
      this.logger.info('='.repeat(60));
      this.logger.info('Starting Edge Agent v2.0.0 (Phase 2: Transport + Scheduler)');
      this.logger.info('='.repeat(60));

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

    // Then poll on interval
    this.pollInterval = setInterval(() => {
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
  private async processMessage(message: any): Promise<void> {
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
        // NEW: Check for reflex/burst split (fast path)
        if (response.reflex_message) {
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

          // Send burst messages after delay (if any)
          if (response.burst_messages && response.burst_messages.length > 0) {
            const delayMs = response.burst_delay_ms || 2000;
            this.logger.info(`⏳ Will send ${response.burst_messages.length} burst messages after ${delayMs}ms`);
            this.logger.info(`   Burst messages: ${JSON.stringify(response.burst_messages)}`);

            setTimeout(async () => {
              this.logger.info('-'.repeat(60));
              this.logger.info(`📤 SENDING BURST MESSAGES to ${message.threadId}`);
              for (let i = 0; i < response.burst_messages!.length; i++) {
                this.logger.info(`   [${i + 1}/${response.burst_messages!.length}]: "${response.burst_messages![i]}"`);
              }
              this.logger.info('-'.repeat(60));

              const burstSent = await this.transport.sendMultiBubble(
                message.threadId,
                response.burst_messages!,
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
        // Legacy multi-bubble response
        else if (response.reply_bubbles && response.reply_bubbles.length > 0) {
          // Check if first bubble was already sent via WebSocket as reflex
          const wsReflex = this.wsReflexSent.get(message.threadId);
          let bubblesToSend = response.reply_bubbles;

          if (wsReflex && response.reply_bubbles[0] === wsReflex.text) {
            // Skip first bubble - already sent via WebSocket
            bubblesToSend = response.reply_bubbles.slice(1);
            this.logger.info('⏭️  Skipping first bubble (already sent via WebSocket reflex)');
            this.wsReflexSent.delete(message.threadId); // Clean up tracking
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

    // Then sync on interval
    this.syncInterval = setInterval(() => {
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
  private async processCommand(command: any): Promise<void> {
    try {
      // Log command priority if specified
      if (command.priority === 'immediate') {
        this.logger.info(`⚡ Processing IMMEDIATE priority command ${command.command_id}`);
      }

      // Execute command
      const result = await this.commandHandler.executeCommand(command);

      // Track WebSocket-sent reflex messages (for skipping duplicates in HTTP response)
      if (result.success && command.command_type === 'send_message_now') {
        const payload = command.payload;
        if (payload.bubble_type === 'reflex') {
          this.wsReflexSent.set(payload.thread_id, {
            text: payload.text,
            timestamp: Date.now()
          });
          this.logger.info(`📝 Tracked WebSocket reflex for ${payload.thread_id}: "${payload.text}"`);

          // Auto-cleanup after 10 seconds to prevent memory leak
          setTimeout(() => {
            this.wsReflexSent.delete(payload.thread_id);
          }, 10000);
        }
      }

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
  private applyConfigUpdates(updates: any): void {
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
  private addEvent(eventType: string, threadId: string | undefined, details: any): void {
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
  stop(): void {
    this.logger.info('Stopping Edge Agent...');

    this.isRunning = false;

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Disconnect WebSocket
    this.wsClient.disconnect();

    this.scheduler.stop();
    this.transport.stop();

    this.logger.info('✅ Edge Agent stopped');
  }
}

/**
 * Main entry point
 */
async function main() {
  const agent = new EdgeAgent();

  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, shutting down gracefully...');
    agent.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\nReceived SIGTERM, shutting down gracefully...');
    agent.stop();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    agent.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
    agent.stop();
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
