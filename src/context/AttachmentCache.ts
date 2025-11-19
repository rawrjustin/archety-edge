import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { encryptString, decryptString } from '../utils/crypto';
import { ILogger } from '../interfaces/ILogger';
import { BackendMiniAppContext } from '../interfaces/IBackendClient';

export interface AttachmentCacheRecord {
  guid: string;
  attachmentId?: number;
  threadId: string;
  isGroup: boolean;
  participants: string[];
  filename?: string;
  transferName?: string;
  uti?: string;
  mimeType?: string;
  absolutePath?: string;
  relativePath?: string;
  sizeBytes?: number;
  isSticker?: boolean;
  isOutgoing?: boolean;
  context?: BackendMiniAppContext;
  lastPhotoId?: string;
  lastUploadedAt?: string;
}

export class AttachmentCache {
  private db: Database.Database;

  constructor(
    private readonly dbPath: string,
    private readonly encryptionKey: Buffer,
    private readonly logger: ILogger
  ) {
    this.ensureDirectory();
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  saveOrUpdate(record: AttachmentCacheRecord): void {
    const existing = this.get(record.guid);
    const merged: AttachmentCacheRecord = {
      ...existing,
      ...record,
      participants: record.participants && record.participants.length > 0
        ? record.participants
        : existing?.participants || [],
      context: record.context || existing?.context,
      mimeType: record.mimeType || existing?.mimeType,
      absolutePath: record.absolutePath || existing?.absolutePath,
      relativePath: record.relativePath || existing?.relativePath,
      filename: record.filename || existing?.filename,
      transferName: record.transferName || existing?.transferName,
      uti: record.uti || existing?.uti,
      sizeBytes: record.sizeBytes || existing?.sizeBytes,
      isSticker: typeof record.isSticker === 'boolean' ? record.isSticker : existing?.isSticker,
      isOutgoing: typeof record.isOutgoing === 'boolean' ? record.isOutgoing : existing?.isOutgoing,
      attachmentId: record.attachmentId || existing?.attachmentId,
      lastPhotoId: existing?.lastPhotoId,
      lastUploadedAt: existing?.lastUploadedAt
    };

    const payload = encryptString(JSON.stringify(merged), this.encryptionKey);
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO attachment_cache (guid, payload, updated_at, created_at)
      VALUES (@guid, @payload, @updatedAt, @createdAt)
      ON CONFLICT(guid) DO UPDATE SET
        payload = excluded.payload,
        updated_at = excluded.updated_at
    `).run({
      guid: record.guid,
      payload,
      updatedAt: now,
      createdAt: existing ? existing.lastUploadedAt ?? now : now
    });
  }

  markUploaded(guid: string, photoId: string): void {
    const existing = this.get(guid);
    if (!existing) {
      return;
    }

    existing.lastPhotoId = photoId;
    existing.lastUploadedAt = new Date().toISOString();
    const payload = encryptString(JSON.stringify(existing), this.encryptionKey);

    this.db.prepare(`
      UPDATE attachment_cache
      SET payload = @payload,
          updated_at = @updatedAt
      WHERE guid = @guid
    `).run({
      guid,
      payload,
      updatedAt: existing.lastUploadedAt
    });
  }

  get(guid: string): AttachmentCacheRecord | null {
    const row = this.db.prepare(`SELECT payload FROM attachment_cache WHERE guid = ?`).get(guid) as any;
    if (!row) {
      return null;
    }

    try {
      const decrypted = decryptString(row.payload, this.encryptionKey);
      return JSON.parse(decrypted);
    } catch (error: any) {
      this.logger.warn(`Failed to decrypt attachment cache for ${guid}: ${error.message}. Deleting corrupted record.`);
      this.db.prepare(`DELETE FROM attachment_cache WHERE guid = ?`).run(guid);
      return null;
    }
  }

  close(): void {
    this.db.close();
  }

  private ensureDirectory(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS attachment_cache (
        guid TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }
}

