import { ILogger } from '../interfaces/ILogger';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  identifier: string; // e.g., 'send_message', 'backend_request'
}

/**
 * Simple in-memory rate limiter
 * Tracks request timestamps and enforces limits per identifier
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Check if request is allowed under rate limit
   * @returns true if allowed, false if rate limited
   */
  async checkLimit(config: RateLimitConfig): Promise<boolean> {
    const now = Date.now();
    const key = config.identifier;

    // Get existing requests in current window
    let requestTimes = this.requests.get(key) || [];

    // Remove requests outside the window
    requestTimes = requestTimes.filter(time => now - time < config.windowMs);

    // Check if limit exceeded
    if (requestTimes.length >= config.maxRequests) {
      const oldestRequest = Math.min(...requestTimes);
      const retryAfter = Math.ceil((config.windowMs - (now - oldestRequest)) / 1000);

      this.logger.warn(
        `⚠️  Rate limit exceeded for ${key}: ${requestTimes.length}/${config.maxRequests} in ${config.windowMs}ms (retry after ${retryAfter}s)`
      );

      return false;
    }

    // Add current request
    requestTimes.push(now);
    this.requests.set(key, requestTimes);

    return true;
  }

  /**
   * Clean up old request data (call periodically)
   * Removes entries older than 1 minute
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 60000; // 1 minute

    for (const [key, times] of this.requests.entries()) {
      const filtered = times.filter(time => now - time < maxAge);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }

  /**
   * Get current rate limit status for an identifier
   */
  getStatus(identifier: string, windowMs: number): {
    requestCount: number;
    oldestRequest: number | null;
  } {
    const now = Date.now();
    const requestTimes = this.requests.get(identifier) || [];
    const recentRequests = requestTimes.filter(time => now - time < windowMs);

    return {
      requestCount: recentRequests.length,
      oldestRequest: recentRequests.length > 0 ? Math.min(...recentRequests) : null
    };
  }

  /**
   * Reset rate limit for an identifier
   */
  reset(identifier: string): void {
    this.requests.delete(identifier);
  }
}
