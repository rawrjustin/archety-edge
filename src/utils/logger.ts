import { ILogger, LogLevel } from '../interfaces/ILogger';
import * as fs from 'fs';

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const LOG_CHECK_INTERVAL = 1000; // Check size every N writes

export class Logger implements ILogger {
  private level: LogLevel;
  private logFile: string | null;
  private writeCount = 0;
  private levels: { [key in LogLevel]: number } = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(level: LogLevel = 'info', logFile?: string) {
    this.level = level;
    this.logFile = logFile || null;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.levels[level] >= this.levels[this.level];
  }

  private formatMessage(level: string, message: string, args: any[]): string {
    const timestamp = new Date().toISOString();
    const argsStr = args.length > 0 ? ' ' + JSON.stringify(args) : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${argsStr}`;
  }

  private rotateIfNeeded(): void {
    if (!this.logFile) return;
    this.writeCount++;
    if (this.writeCount % LOG_CHECK_INTERVAL !== 0) return;

    try {
      const stats = fs.statSync(this.logFile);
      if (stats.size > MAX_LOG_SIZE) {
        const rotated = this.logFile + '.1';
        // Keep one rotated backup
        try { fs.unlinkSync(rotated); } catch {}
        fs.renameSync(this.logFile, rotated);
      }
    } catch {}
  }

  private log(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) return;

    const formatted = this.formatMessage(level, message, args);

    // Console output
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }

    // File output
    if (this.logFile) {
      try {
        this.rotateIfNeeded();
        fs.appendFileSync(this.logFile, formatted + '\n');
      } catch (err) {
        console.error('Failed to write to log file:', err);
      }
    }
  }

  debug(message: string, ...args: any[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: any[]): void {
    this.log('error', message, ...args);
  }
}
