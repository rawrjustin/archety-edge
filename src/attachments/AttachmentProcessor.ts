import * as fs from 'fs/promises';
import * as path from 'path';
import { ILogger } from '../interfaces/ILogger';
import { MessageAttachment } from '../interfaces/IMessageTransport';
import { PhotoTranscoder } from './PhotoTranscoder';

export interface PreparedAttachment {
  attachment: MessageAttachment;
  mimeType: string | undefined;
  sizeBytes: number | null;
  base64?: string;
  skipped: boolean;
  skipReason?: string;
  checksum?: string;
}

const DEFAULT_MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const PHOTO_UTIS = new Set([
  'public.jpeg',
  'public.png',
  'public.heic',
  'public.heif',
  'public.tiff',
  'com.compuserve.gif'
]);

const PHOTO_MIME_PREFIXES = ['image/'];

/**
 * AttachmentProcessor
 * - Detects whether attachments are photos we can upload
 * - Reads file contents (with size guard)
 * - Returns base64 payload for backend upload pipeline
 */
export class AttachmentProcessor {
  constructor(
    private readonly logger: ILogger,
    private readonly maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES,
    private readonly photoTranscoder?: PhotoTranscoder
  ) {}

  /**
   * Prepare attachments for upload (photos only for now)
   */
  async prepareAttachments(attachments: MessageAttachment[]): Promise<PreparedAttachment[]> {
    const prepared: PreparedAttachment[] = [];

    for (const attachment of attachments) {
      if (!this.isPhotoCandidate(attachment)) {
        prepared.push({
          attachment,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.totalBytes ?? null,
          skipped: true,
          skipReason: 'non_photo_attachment'
        });
        continue;
      }

      if (!attachment.absolutePath) {
        prepared.push({
          attachment,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.totalBytes ?? null,
          skipped: true,
          skipReason: 'missing_file_path'
        });
        continue;
      }

      try {
        const stats = await fs.stat(attachment.absolutePath);

        let normalizedBuffer: Buffer;
        let normalizedSize = stats.size;
        let mimeType = attachment.mimeType || this.guessMimeType(attachment);

        const exceedsLimit = stats.size > this.maxSizeBytes;
        const needsTranscode =
          exceedsLimit ||
          (mimeType && (mimeType === 'image/heic' || mimeType === 'image/heif'));

        if (needsTranscode && this.photoTranscoder) {
          const result = await this.photoTranscoder.normalize(
            attachment.absolutePath,
            mimeType
          );
          normalizedBuffer = result.buffer;
          normalizedSize = result.size;
          mimeType = result.mimeType;
        } else {
          if (exceedsLimit) {
            prepared.push({
              attachment,
              mimeType,
              sizeBytes: stats.size,
              skipped: true,
              skipReason: 'file_exceeds_limit'
            });
            continue;
          }
          normalizedBuffer = await fs.readFile(attachment.absolutePath);
        }

        const base64 = normalizedBuffer.toString('base64');

        prepared.push({
          attachment,
          mimeType,
          sizeBytes: normalizedSize,
          base64,
          skipped: false
        });
      } catch (error: any) {
        this.logger.warn(`Failed to prepare attachment ${attachment.guid}: ${error.message}`);
        prepared.push({
          attachment,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.totalBytes ?? null,
          skipped: true,
          skipReason: 'file_read_error'
        });
      }
    }

    return prepared;
  }

  /**
   * Determine if attachment is a photo (for MVP scope)
   */
  isPhotoCandidate(attachment: MessageAttachment): boolean {
    if (attachment.uti && PHOTO_UTIS.has(attachment.uti)) {
      return true;
    }

    const mimeType = attachment.mimeType;
    if (mimeType && PHOTO_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix))) {
      return true;
    }

    if (attachment.transferName) {
      const ext = path.extname(attachment.transferName).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif', '.tiff', '.tif'].includes(ext);
    }

    if (attachment.filename) {
      const ext = path.extname(attachment.filename).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif', '.tiff', '.tif'].includes(ext);
    }

    return false;
  }

  /**
   * Fallback MIME detection from filename extension
   */
  private guessMimeType(attachment: MessageAttachment): string | undefined {
    const source = attachment.transferName || attachment.filename;
    if (!source) {
      return undefined;
    }

    const ext = path.extname(source).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.heic':
      case '.heif':
        return 'image/heic';
      case '.tif':
      case '.tiff':
        return 'image/tiff';
      default:
        return undefined;
    }
  }
}

