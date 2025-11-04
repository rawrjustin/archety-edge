#!/usr/bin/env node
/**
 * Edge Agent - Mac Mini iMessage Relay
 * Phase 2: Transport + Scheduler (monitor, forward, respond, schedule)
 */

import { loadConfig, validateConfig } from './config';
import { Logger } from './utils/logger';
import { AppleScriptTransport } from './transports/AppleScriptTransport';
import { RenderClient } from './backend/RenderClient';
import { Scheduler } from './scheduler/Scheduler';
import { CommandHandler } from './commands/CommandHandler';
import { v4 as uuidv4 } from 'uuid';
import { EdgeEventWrapper } from './interfaces/ICommands';

/**
 * Main application class
 */
class EdgeAgent {
  private config: any;
  private logger: Logger;
  private transport: AppleScriptTransport;
  private backend: RenderClient;
  private scheduler: Scheduler;
  private commandHandler: CommandHandler;
  private pollInterval: NodeJS.Timeout | null = null;
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private startTime: Date = new Date();
  private pendingEvents: EdgeEventWrapper[] = [];
  private lastCommandId: string | null = null;

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

    // Initialize backend client
    const secret = process.env.EDGE_SECRET || 'CHANGE_THIS_SECRET_IN_PRODUCTION';
    this.backend = new RenderClient(
      this.config.backend.url,
      this.config.edge.user_phone,
      secret,
      this.logger
    );

    // Initialize scheduler
    const dbPath = this.config.database?.path || './data/scheduler.db';
    this.scheduler = new Scheduler(dbPath, this.transport, this.logger);

    // Initialize command handler
    this.commandHandler = new CommandHandler(this.scheduler, this.logger);

    this.logger.info('Edge Agent initialized with scheduler');
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

      // Start transport
      this.logger.info('Starting iMessage transport...');
      await this.transport.start();
      this.logger.info('✅ Transport ready');

      // Start scheduler
      this.logger.info('Starting scheduler...');
      this.scheduler.start(30); // Check every 30 seconds
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

      // Start sync loop
      this.startSyncLoop();

      this.logger.info('='.repeat(60));
      this.logger.info('✅ Edge Agent is running!');
      this.logger.info(`Polling for messages every ${this.config.imessage.poll_interval_seconds}s`);
      this.logger.info(`Syncing with backend every ${this.config.backend.sync_interval_seconds}s`);
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

      // Process each message
      for (const message of messages) {
        await this.processMessage(message);
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
      this.logger.info(`Processing message from ${message.sender}`);
      this.logger.debug('Message text:', message.text);

      // Send to backend for processing
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

      // Send response if backend wants us to
      if (response.should_respond) {
        // Check for multi-bubble response
        if (response.reply_bubbles && response.reply_bubbles.length > 0) {
          this.logger.info(`📤 Sending ${response.reply_bubbles.length} bubbles to ${message.threadId}`);
          this.logger.debug('Bubble texts:', response.reply_bubbles);

          const sent = await this.transport.sendMultiBubble(
            message.threadId,
            response.reply_bubbles,
            message.isGroup
          );

          if (sent) {
            this.logger.info('✅ Multi-bubble response sent successfully');
          } else {
            this.logger.error('❌ Failed to send multi-bubble response');
          }
        } else if (response.reply_text) {
          // Backwards compatibility: single bubble
          this.logger.info(`📤 Sending response to ${message.threadId}`);
          this.logger.debug('Response text:', response.reply_text);

          const sent = await this.transport.sendMessage(
            message.threadId,
            response.reply_text,
            message.isGroup
          );

          if (sent) {
            this.logger.info('✅ Response sent successfully');
          } else {
            this.logger.error('❌ Failed to send response');
          }
        }
      } else {
        this.logger.debug('Backend did not request a response');
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
          active_rules: 0, // TODO: Implement rule engine
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
      // Execute command
      const result = await this.commandHandler.executeCommand(command);

      // Update last command ID
      this.lastCommandId = command.command_id;

      // Acknowledge command
      await this.backend.acknowledgeCommand(
        command.command_id,
        result.success,
        result.error
      );

      if (result.success) {
        this.logger.info(`✅ Command ${command.command_id} executed successfully`);
      } else {
        this.logger.error(`❌ Command ${command.command_id} failed: ${result.error}`);
      }
    } catch (error: any) {
      this.logger.error(`Error processing command ${command.command_id}:`, error.message);

      // Acknowledge failure
      await this.backend.acknowledgeCommand(
        command.command_id,
        false,
        error.message
      );
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
