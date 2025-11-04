import { ILogger, LogLevel } from '../../src/interfaces/ILogger';

/**
 * Mock logger for testing
 * Captures all log messages for assertion
 */
export class MockLogger implements ILogger {
  public debugMessages: string[] = [];
  public infoMessages: string[] = [];
  public warnMessages: string[] = [];
  public errorMessages: string[] = [];
  public currentLevel: LogLevel = 'info';

  debug(...messages: any[]): void {
    this.debugMessages.push(messages.join(' '));
  }

  info(...messages: any[]): void {
    this.infoMessages.push(messages.join(' '));
  }

  warn(...messages: any[]): void {
    this.warnMessages.push(messages.join(' '));
  }

  error(...messages: any[]): void {
    this.errorMessages.push(messages.join(' '));
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
  }

  /**
   * Clear all captured messages
   */
  clear(): void {
    this.debugMessages = [];
    this.infoMessages = [];
    this.warnMessages = [];
    this.errorMessages = [];
  }

  /**
   * Get all messages
   */
  getAllMessages(): string[] {
    return [
      ...this.debugMessages,
      ...this.infoMessages,
      ...this.warnMessages,
      ...this.errorMessages
    ];
  }
}
