import sharp from 'sharp';
import { execFile } from 'child_process';
import { tmpdir } from 'os';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ILogger } from '../interfaces/ILogger';

export interface TranscodeResult {
  buffer: Buffer;
  size: number;
  mimeType: string;
}

const JPEG_MIME = 'image/jpeg';
const PNG_MIME = 'image/png';
const TARGET_DIMENSION = 1024;

export class PhotoTranscoder {
  constructor(
    private readonly logger: ILogger,
    private readonly maxSizeBytes: number
  ) {}

  async normalize(filePath: string, currentMime?: string): Promise<TranscodeResult> {
    let buffer: Buffer;
    let mimeType = currentMime;

    try {
      // Try sharp first (now has vips 8.17.3 with heif 1.20.2)
      const initial = await this.trySharpPipeline(filePath, mimeType);
      buffer = initial.buffer;
      mimeType = initial.mimeType;
    } catch (error: any) {
      // Fallback to sips for HEIC if sharp fails
      const isHeic = (mimeType && mimeType.includes('heic')) ||
                     (mimeType && mimeType.includes('heif')) ||
                     filePath.toLowerCase().endsWith('.heic') ||
                     filePath.toLowerCase().endsWith('.heif');

      if (isHeic) {
        this.logger.warn(`sharp failed HEIC conversion (${error.message}), falling back to sips`);
        const fallback = await this.convertHeicWithSips(filePath);
        buffer = fallback.buffer;
        mimeType = fallback.mimeType;
      } else {
        throw error;
      }
    }

    const pngResult = await this.resizeAndEncode(buffer, PNG_MIME);
    if (pngResult.size <= this.maxSizeBytes) {
      return pngResult;
    }

    const jpegResult = await this.resizeAndEncode(buffer, JPEG_MIME);
    if (jpegResult.size <= this.maxSizeBytes) {
      return jpegResult;
    }

    throw new Error(`Transcoded image still exceeds limit (${jpegResult.size} > ${this.maxSizeBytes})`);
  }

  private async trySharpPipeline(filePath: string, currentMime?: string): Promise<TranscodeResult> {
    const image = sharp(filePath, { failOn: 'none' });
    const metadata = await image.metadata();
    const format = metadata.format?.toLowerCase();

    const needsJpeg =
      !currentMime ||
      currentMime === 'image/heic' ||
      currentMime === 'image/heif' ||
      format === 'heic' ||
      format === 'heif';

    const buffer = needsJpeg
      ? await sharp(filePath, { failOn: 'none' }).jpeg({ quality: 95, mozjpeg: true }).toBuffer()
      : await image.toBuffer();

    return {
      buffer,
      size: buffer.length,
      mimeType: needsJpeg ? JPEG_MIME : currentMime || PNG_MIME
    };
  }

  private async resizeAndEncode(sourceBuffer: Buffer, format: 'image/png' | 'image/jpeg'): Promise<TranscodeResult> {
    const pipeline = sharp(sourceBuffer, { failOn: 'none' })
      .resize({
        width: TARGET_DIMENSION,
        height: TARGET_DIMENSION,
        fit: 'inside',
        withoutEnlargement: false
      });

    const encoded =
      format === PNG_MIME
        ? pipeline.png({ compressionLevel: 3, adaptiveFiltering: true })
        : pipeline.jpeg({ quality: 95, chromaSubsampling: '4:4:4', mozjpeg: true });

    const buffer = await encoded.toBuffer();
    return {
      buffer,
      size: buffer.length,
      mimeType: format
    };
  }

  private async convertHeicWithSips(filePath: string): Promise<TranscodeResult> {
    const tempDir = await fs.mkdtemp(path.join(tmpdir(), 'heic-convert-'));
    const tempFile = path.join(tempDir, `${path.basename(filePath, path.extname(filePath))}.jpg`);

    try {
      await this.execFileAsync('xcrun', ['sips', '-s', 'format', 'jpeg', filePath, '--out', tempFile]);
      const buffer = await fs.readFile(tempFile);
      const png = await this.resizeAndEncode(buffer, PNG_MIME);
      if (png.size <= this.maxSizeBytes) {
        return png;
      }
      return await this.resizeAndEncode(buffer, JPEG_MIME);
    } finally {
      await fs.rm(tempFile, { force: true });
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }

  private execFileAsync(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(command, args, (error) => (error ? reject(error) : resolve()));
    });
  }
}
