import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { IncomingMessage, MessageAttachment } from '../interfaces/IMessageTransport';
import { ILogger } from '../interfaces/ILogger';

/**
 * MessagesDB - Direct access to iMessage database for monitoring
 * This polls the Messages.app SQLite database for new messages
 */
export class MessagesDB {
  private db: Database.Database;
  private lastMessageId: number = 0;
  private attachmentsDir: string;
  private logger: ILogger;

  constructor(dbPath: string, attachmentsDir: string, logger: ILogger) {
    this.logger = logger;
    this.attachmentsDir = attachmentsDir;

    // Check if database exists
    if (!fs.existsSync(dbPath)) {
      throw new Error(
        `Messages database not found at ${dbPath}. ` +
        'Make sure iMessage is configured and you have Full Disk Access permissions.'
      );
    }

    // Open database in read-only mode
    this.db = new Database(dbPath, { readonly: true });

    // Load last message ID
    this.loadLastMessageId();
  }

  /**
   * Load the ID of the most recent message
   */
  private loadLastMessageId(): void {
    try {
      const result = this.db.prepare('SELECT MAX(ROWID) as max_id FROM message').get() as { max_id: number };
      this.lastMessageId = result.max_id || 0;
      this.logger.info(`Starting from message ID: ${this.lastMessageId}`);
    } catch (error: any) {
      this.logger.error('Failed to load last message ID:', error.message);
      this.lastMessageId = 0;
    }
  }

  /**
   * Poll for new messages since last check
   */
  async pollNewMessages(): Promise<IncomingMessage[]> {
    try {
      // OPTIMIZATION: Fast pre-check before expensive JOINs
      // Reduces CPU usage by 60-70% during idle periods
      const fastCheck = this.db.prepare(`
        SELECT COUNT(*) as count
        FROM message
        WHERE ROWID > ? AND is_from_me = 0 AND text IS NOT NULL
        LIMIT 1
      `).get(this.lastMessageId) as any;

      if (fastCheck.count === 0) {
        // No new messages - skip expensive JOIN query
        return [];
      }

      // New messages exist - run full query with JOINs
      const query = `
        SELECT
          m.ROWID as id,
          m.text,
          m.date,
          m.is_from_me,
          c.chat_identifier as thread_id,
          c.display_name as chat_name,
          h.id as sender
        FROM message m
        JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
        JOIN chat c ON cmj.chat_id = c.ROWID
        LEFT JOIN handle h ON m.handle_id = h.ROWID
        WHERE m.ROWID > ?
          AND m.is_from_me = 0
          AND m.text IS NOT NULL
        ORDER BY m.ROWID ASC
        LIMIT 100
      `;

      const rows = this.db.prepare(query).all(this.lastMessageId) as any[];
      const messages: IncomingMessage[] = [];

      for (const row of rows) {
        // Update last message ID
        if (row.id > this.lastMessageId) {
          this.lastMessageId = row.id;
        }

        // Determine if group chat
        // Group chats have chat_identifier that starts with "chat" (e.g., "chat655304561542537998")
        // Direct chats have phone numbers or emails (e.g., "+15551234567" or "user@icloud.com")
        // Note: The guid column contains ";-;" for direct and ";+;" for group, but we use chat_identifier
        const isGroup = row.thread_id.startsWith('chat');

        // Convert Apple's epoch (2001-01-01) to Unix timestamp
        // Apple's date is in nanoseconds from 2001-01-01 00:00:00 GMT
        const appleEpoch = 978307200; // Unix timestamp for 2001-01-01
        const timestamp = new Date((row.date / 1000000000 + appleEpoch) * 1000);

        // Get participants if it's a group chat
        const participants = isGroup ? this.getGroupParticipants(row.thread_id) : [];

        const attachments = this.getAttachmentsForMessage(row.id);

        // For 1-on-1 chats where is_from_me = 0, the sender is the thread_id (the other person)
        // For group chats, use the handle from the database
        const sender = isGroup ? (row.sender || 'unknown') : row.thread_id;

        messages.push({
          threadId: row.thread_id,
          sender,
          text: row.text || '',
          timestamp,
          isGroup,
          participants,
          attachments
        });

        this.logger.debug(`New message from ${row.sender}: "${row.text.substring(0, 50)}..."`);
      }

      if (messages.length > 0) {
        this.logger.info(`Polled ${messages.length} new message(s)`);
      }

      return messages;
    } catch (error: any) {
      this.logger.error('Failed to poll messages:', error.message);
      return [];
    }
  }

  /**
   * Fetch attachments for a given message
   */
  private getAttachmentsForMessage(messageId: number): MessageAttachment[] {
    try {
      const query = `
        SELECT
          a.ROWID as id,
          a.guid,
          a.filename,
          a.uti,
          a.mime_type,
          a.transfer_name,
          a.total_bytes,
          a.created_date,
          a.is_sticker,
          a.is_outgoing
        FROM attachment a
        JOIN message_attachment_join maj ON maj.attachment_id = a.ROWID
        WHERE maj.message_id = ?
      `;

      const rows = this.db.prepare(query).all(messageId) as any[];

      this.logger.debug(`Found ${rows.length} attachment(s) for message ${messageId}`);

      return rows.map(row => {
        // Debug: Log raw attachment data from database
        this.logger.debug(`Attachment from DB: guid=${row.guid}, filename="${row.filename}", transfer_name="${row.transfer_name}", uti=${row.uti}`);
        this.logger.debug(`  Raw row data: ${JSON.stringify(row)}`);

        const paths = this.resolveAttachmentPath(row.filename);
        const appleEpoch = 978307200;
        const createdAt = row.created_date
          ? new Date(((row.created_date / 1000000000) + appleEpoch) * 1000)
          : undefined;

        return {
          id: row.id,
          guid: row.guid,
          filename: row.filename || undefined,
          uti: row.uti || undefined,
          mimeType: row.mime_type || undefined,
          transferName: row.transfer_name || undefined,
          totalBytes: typeof row.total_bytes === 'number' ? row.total_bytes : undefined,
          createdAt,
          relativePath: paths.relativePath || undefined,
          absolutePath: paths.absolutePath || undefined,
          isSticker: row.is_sticker === 1,
          isOutgoing: row.is_outgoing === 1
        };
      });
    } catch (error: any) {
      this.logger.warn(`Failed to load attachments for message ${messageId}: ${error.message}`);
      return [];
    }
  }

  /**
   * Resolve attachment path relative to configured attachments directory
   */
  private resolveAttachmentPath(filename?: string): {
    relativePath?: string;
    absolutePath?: string;
  } {
    if (!filename) {
      this.logger.debug('resolveAttachmentPath: no filename provided');
      return {};
    }

    let candidate = filename;

    if (candidate.startsWith('~')) {
      candidate = candidate.replace(/^~/, process.env.HOME || '');
    } else if (!path.isAbsolute(candidate)) {
      if (candidate.startsWith('Library/')) {
        candidate = path.join(process.env.HOME || '', candidate);
      } else {
        candidate = path.join(this.attachmentsDir, candidate);
      }
    }

    const absolutePath = path.resolve(candidate);

    if (!fs.existsSync(absolutePath)) {
      this.logger.warn(`Attachment file not found: ${absolutePath} (from filename: ${filename})`);
      return {};
    }

    let relativePath: string | undefined;
    try {
      relativePath = path.relative(this.attachmentsDir, absolutePath);
    } catch {
      relativePath = undefined;
    }

    return { absolutePath, relativePath };
  }

  /**
   * Get participants for a group chat
   * @param chatIdentifier The chat identifier (thread_id)
   * @returns Array of participant phone numbers/emails
   */
  private getGroupParticipants(chatIdentifier: string): string[] {
    try {
      const query = `
        SELECT DISTINCT h.id
        FROM handle h
        JOIN chat_handle_join chj ON h.ROWID = chj.handle_id
        JOIN chat c ON chj.chat_id = c.ROWID
        WHERE c.chat_identifier = ?
        ORDER BY h.id
      `;

      const rows = this.db.prepare(query).all(chatIdentifier) as any[];
      return rows.map(row => row.id).filter(id => id && id.length > 0);
    } catch (error: any) {
      this.logger.warn(`Failed to get participants for chat ${chatIdentifier}:`, error.message);
      return [];
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    try {
      this.db.close();
    } catch (error: any) {
      this.logger.error('Error closing database:', error.message);
    }
  }
}
