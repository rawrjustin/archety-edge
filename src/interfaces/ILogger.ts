/**
 * ILogger - Abstract interface for logging
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ILogger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;

  setLevel(level: LogLevel): void;
}
