import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { ILogger } from '../interfaces/ILogger';
import { IMessageTransport } from '../interfaces/IMessageTransport';

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
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  constructor(
    dbPath: string,
    transport: IMessageTransport,
    logger: ILogger
  ) {
    this.logger = logger;
    this.transport = transport;

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
   * Start the scheduler loop
   */
  start(checkIntervalSeconds: number = 30): void {
    if (this.isRunning) {
      this.logger.warn('Scheduler already running');
      return;
    }

    this.isRunning = true;
    this.logger.info(`Starting scheduler (checking every ${checkIntervalSeconds}s)`);

    // Check immediately
    this.checkAndSendMessages();

    // Then check on interval
    this.checkInterval = setInterval(() => {
      this.checkAndSendMessages();
    }, checkIntervalSeconds * 1000);
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
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Check for messages to send and execute them
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
        return;
      }

      this.logger.info(`⏰ Found ${rows.length} scheduled message(s) to send`);

      // Process each message
      for (const row of rows) {
        const message = this.rowToMessage(row);
        await this.executeMessage(message);
      }
    } catch (error: any) {
      this.logger.error('Error checking scheduled messages:', error.message);
    }
  }

  /**
   * Execute a scheduled message
   */
  private async executeMessage(message: ScheduledMessage): Promise<void> {
    try {
      this.logger.info(`📤 Sending scheduled message ${message.id}`);
      this.logger.debug(`  Thread: ${message.thread_id}`);
      this.logger.debug(`  Text: ${message.message_text.substring(0, 50)}...`);

      // Send via transport
      const success = await this.transport.sendMessage(
        message.thread_id,
        message.message_text,
        message.is_group
      );

      if (success) {
        // Mark as sent
        const updateStmt = this.db.prepare(`
          UPDATE scheduled_messages
          SET status = 'sent'
          WHERE id = ?
        `);
        updateStmt.run(message.id);

        this.logger.info(`✅ Scheduled message ${message.id} sent successfully`);
      } else {
        // Mark as failed
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
   */
  getStats(): {
    pending: number;
    sent: number;
    failed: number;
    cancelled: number;
  } {
    const countByStatus = (status: string): number => {
      const stmt = this.db.prepare(`
        SELECT COUNT(*) as count FROM scheduled_messages WHERE status = ?
      `);
      const result = stmt.get(status) as any;
      return result.count;
    };

    return {
      pending: countByStatus('pending'),
      sent: countByStatus('sent'),
      failed: countByStatus('failed'),
      cancelled: countByStatus('cancelled')
    };
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
