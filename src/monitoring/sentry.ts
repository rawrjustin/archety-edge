import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { Config } from '../types/config.types';
import { ILogger } from '../interfaces/ILogger';

/**
 * Sentry Integration for Error Tracking & Performance Monitoring
 * Provides centralized error reporting with context enrichment
 */
export class SentryMonitoring {
  private logger: ILogger;
  private config: Config;
  private initialized: boolean = false;

  constructor(config: Config, logger: ILogger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initialize Sentry with configuration
   */
  initialize(): void {
    if (this.initialized) {
      this.logger.warn('⚠️  Sentry already initialized');
      return;
    }

    const sentryConfig = this.config.monitoring?.sentry;

    // Skip if Sentry not configured
    if (!sentryConfig?.enabled || !sentryConfig.dsn) {
      this.logger.info('Sentry monitoring disabled (not configured)');
      return;
    }

    try {
      Sentry.init({
        dsn: sentryConfig.dsn,
        environment: sentryConfig.environment || 'production',
        release: `edge-relay@${process.env.npm_package_version || '1.0.0'}`,

        // Performance Monitoring
        tracesSampleRate: sentryConfig.traces_sample_rate || 0.1, // 10% of transactions

        // Profiling (optional)
        profilesSampleRate: sentryConfig.profiles_sample_rate || 0.1,
        integrations: [
          nodeProfilingIntegration(),
        ],

        // Error filtering
        beforeSend(event, hint) {
          // Don't send errors for known non-critical issues
          const error = hint.originalException;
          if (error && typeof error === 'object' && 'message' in error) {
            const message = String(error.message).toLowerCase();

            // Filter out expected errors
            if (
              message.includes('econnrefused') ||
              message.includes('network timeout') ||
              message.includes('socket hang up')
            ) {
              // Still log locally but don't spam Sentry
              return null;
            }
          }

          return event;
        },

        // Global tags
        initialScope: {
          tags: {
            'agent.id': this.config.edge.agent_id,
            'agent.phone': this.config.edge.user_phone,
            'node.version': process.version,
            'platform': process.platform,
          },
          user: {
            id: this.config.edge.agent_id,
            username: this.config.edge.user_phone,
          },
        },
      });

      this.initialized = true;
      this.logger.info('✅ Sentry monitoring initialized');
      this.logger.info(`   Environment: ${sentryConfig.environment || 'production'}`);
      this.logger.info(`   Traces Sample Rate: ${(sentryConfig.traces_sample_rate || 0.1) * 100}%`);
    } catch (error) {
      this.logger.error('❌ Failed to initialize Sentry:', error);
    }
  }

  /**
   * Capture an exception with context
   */
  captureException(error: Error, context?: Record<string, any>): void {
    if (!this.initialized) {
      return;
    }

    Sentry.captureException(error, {
      extra: context,
    });
  }

  /**
   * Capture a message with severity level
   */
  captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info', context?: Record<string, any>): void {
    if (!this.initialized) {
      return;
    }

    Sentry.captureMessage(message, {
      level,
      extra: context,
    });
  }

  /**
   * Set user context for error tracking
   */
  setUser(userId: string, userData?: Record<string, any>): void {
    if (!this.initialized) {
      return;
    }

    Sentry.setUser({
      id: userId,
      ...userData,
    });
  }

  /**
   * Add breadcrumb for debugging context
   */
  addBreadcrumb(message: string, category: string, data?: Record<string, any>): void {
    if (!this.initialized) {
      return;
    }

    Sentry.addBreadcrumb({
      message,
      category,
      data,
      level: 'info',
      timestamp: Date.now() / 1000,
    });
  }

  /**
   * Start a span for performance monitoring
   * Note: Returns the span result (void in SDK v8)
   */
  async startSpan<T>(name: string, operation: string, callback: () => Promise<T>): Promise<T> {
    return await Sentry.startSpan(
      {
        name,
        op: operation,
        attributes: {
          'agent.id': this.config.edge.agent_id,
        },
      },
      callback
    );
  }

  /**
   * Track WebSocket connection lifecycle
   */
  trackWebSocketEvent(event: 'connected' | 'disconnected' | 'error', context?: Record<string, any>): void {
    this.addBreadcrumb(
      `WebSocket ${event}`,
      'websocket',
      {
        backend_url: this.config.backend.websocket_url,
        ...context,
      }
    );

    if (event === 'error' && context?.error) {
      this.captureMessage(
        `WebSocket error: ${context.error}`,
        'error',
        context
      );
    }
  }

  /**
   * Track message sending
   */
  trackMessageSend(threadId: string, success: boolean, error?: Error): void {
    this.addBreadcrumb(
      `Message send ${success ? 'succeeded' : 'failed'}`,
      'message',
      {
        thread_id: threadId,
        success,
        error: error?.message,
      }
    );

    if (!success && error) {
      this.captureException(error, {
        thread_id: threadId,
        operation: 'send_message',
      });
    }
  }

  /**
   * Track command processing
   */
  trackCommandProcessing(commandType: string, success: boolean, duration: number, error?: Error): void {
    this.addBreadcrumb(
      `Command ${commandType} ${success ? 'completed' : 'failed'}`,
      'command',
      {
        command_type: commandType,
        success,
        duration_ms: duration,
        error: error?.message,
      }
    );

    if (!success && error) {
      this.captureException(error, {
        command_type: commandType,
        duration_ms: duration,
      });
    }
  }

  /**
   * Track rate limit violations
   */
  trackRateLimitViolation(identifier: string, limit: number): void {
    this.captureMessage(
      `Rate limit exceeded: ${identifier}`,
      'warning',
      {
        identifier,
        limit,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Track AppleScript injection attempts
   */
  trackSecurityViolation(violationType: string, details: Record<string, any>): void {
    this.captureMessage(
      `Security violation: ${violationType}`,
      'error',
      {
        violation_type: violationType,
        ...details,
        timestamp: new Date().toISOString(),
      }
    );
  }

  /**
   * Flush all pending events (call before shutdown)
   */
  async flush(timeout: number = 2000): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      await Sentry.flush(timeout);
      this.logger.info('✅ Sentry events flushed');
    } catch (error) {
      this.logger.error('❌ Failed to flush Sentry events:', error);
    }
  }

  /**
   * Close Sentry connection
   */
  async close(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      await Sentry.close(2000);
      this.initialized = false;
      this.logger.info('✅ Sentry monitoring closed');
    } catch (error) {
      this.logger.error('❌ Failed to close Sentry:', error);
    }
  }

  /**
   * Check if Sentry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
