import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { ILogger } from '../interfaces/ILogger';
import { decryptString, encryptString } from '../utils/crypto';

export interface MiniAppContext {
  chatGuid: string;
  appId: string;
  roomId?: string;
  state: 'active' | 'completed';
  metadata?: Record<string, any>;
  startedAt: Date;
  updatedAt: Date;
}

export class ContextManager {
  private db: Database.Database;
  private logger: ILogger;

  constructor(
    dbPath: string,
    private readonly encryptionKey: Buffer,
    logger: ILogger
  ) {
    this.logger = logger;
    this.ensureDirectory(dbPath);
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  /**
   * Persist or update active mini-app context for a chat
   */
  upsertContext(context: Omit<MiniAppContext, 'startedAt' | 'updatedAt'> & { metadata?: Record<string, any> }): void {
    const now = new Date().toISOString();
    const existing = this.getContext(context.chatGuid);

    const payload = JSON.stringify({
      appId: context.appId,
      roomId: context.roomId,
      state: context.state,
      metadata: context.metadata
    });

    const encryptedPayload = encryptString(payload, this.encryptionKey);

    const stmt = this.db.prepare(`
      INSERT INTO chat_contexts (chat_guid, payload, started_at, updated_at)
      VALUES (@chatGuid, @payload, @startedAt, @updatedAt)
      ON CONFLICT(chat_guid) DO UPDATE SET
        payload=excluded.payload,
        updated_at=excluded.updated_at
    `);

    stmt.run({
      chatGuid: context.chatGuid,
      payload: encryptedPayload,
      startedAt: existing ? existing.startedAt.toISOString() : now,
      updatedAt: now
    });

    this.logger.debug(`Context saved for ${context.chatGuid} (${context.appId})`);
  }

  /**
   * Clear an active context
   */
  clearContext(chatGuid: string): void {
    const stmt = this.db.prepare(`DELETE FROM chat_contexts WHERE chat_guid = ?`);
    stmt.run(chatGuid);
    this.logger.debug(`Context cleared for ${chatGuid}`);
  }

  /**
   * Fetch context for chat
   */
  getContext(chatGuid: string): MiniAppContext | null {
    const stmt = this.db.prepare(`SELECT * FROM chat_contexts WHERE chat_guid = ?`);
    const row = stmt.get(chatGuid) as any;
    if (!row) {
      return null;
    }

    return this.deserializeRow(row);
  }

  /**
   * List active contexts
   */
  listContexts(): MiniAppContext[] {
    const stmt = this.db.prepare(`SELECT * FROM chat_contexts ORDER BY updated_at DESC LIMIT 200`);
    const rows = stmt.all() as any[];
    return rows.map(row => this.deserializeRow(row));
  }

  /**
   * Mark context as completed without deleting (retained for conflict resolution)
   */
  completeContext(chatGuid: string, metadata?: Record<string, any>): void {
    const existing = this.getContext(chatGuid);
    if (!existing) {
      return;
    }

    const updatedPayload = {
      ...existing,
      state: 'completed',
      metadata: metadata ?? existing.metadata
    };

    const stmt = this.db.prepare(`
      UPDATE chat_contexts
      SET payload = @payload,
          updated_at = @updatedAt
      WHERE chat_guid = @chatGuid
    `);

    stmt.run({
      chatGuid,
      payload: encryptString(JSON.stringify({
        appId: updatedPayload.appId,
        roomId: updatedPayload.roomId,
        state: updatedPayload.state,
        metadata: updatedPayload.metadata
      }), this.encryptionKey),
      updatedAt: new Date().toISOString()
    });
  }

  /**
   * Close DB
   */
  close(): void {
    this.db.close();
  }

  private ensureDirectory(dbPath: string) {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chat_contexts (
        chat_guid TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  private deserializeRow(row: any): MiniAppContext {
    try {
      const decrypted = decryptString(row.payload, this.encryptionKey);
      const parsed = JSON.parse(decrypted);

      return {
        chatGuid: row.chat_guid,
        appId: parsed.appId,
        roomId: parsed.roomId || undefined,
        state: parsed.state || 'active',
        metadata: parsed.metadata || undefined,
        startedAt: new Date(row.started_at),
        updatedAt: new Date(row.updated_at)
      };
    } catch (error: any) {
      this.logger.error(`Failed to decrypt context for ${row.chat_guid}: ${error.message}`);
      throw error;
    }
  }
}

