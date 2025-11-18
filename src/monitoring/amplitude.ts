import { init, NodeClient } from '@amplitude/node';
import { Identify } from '@amplitude/identify';
import { Config } from '../types/config.types';
import { ILogger } from '../interfaces/ILogger';

/**
 * Amplitude Integration for Product Analytics
 * Tracks user behavior, feature usage, and system metrics
 */
export class AmplitudeAnalytics {
  private logger: ILogger;
  private config: Config;
  private client: NodeClient | null = null;
  private initialized: boolean = false;

  constructor(config: Config, logger: ILogger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Initialize Amplitude with configuration
   */
  initialize(): void {
    if (this.initialized) {
      this.logger.warn('⚠️  Amplitude already initialized');
      return;
    }

    const amplitudeConfig = this.config.monitoring?.amplitude;

    // Skip if Amplitude not configured
    if (!amplitudeConfig?.enabled || !amplitudeConfig.api_key) {
      this.logger.info('Amplitude analytics disabled (not configured)');
      return;
    }

    try {
      const uploadIntervalSec = Math.floor((amplitudeConfig.flush_interval_ms || 10000) / 1000);
      this.client = init(amplitudeConfig.api_key, {
        uploadIntervalInSec: uploadIntervalSec,
        maxCachedEvents: 30,
      });

      this.initialized = true;
      this.logger.info('✅ Amplitude analytics initialized');
      this.logger.info(`   Upload Interval: ${uploadIntervalSec}s`);

      // Track agent started event
      this.trackEvent('agent_started', {
        agent_id: this.config.edge.agent_id,
        user_phone: this.config.edge.user_phone,
        backend_url: this.config.backend.url,
        websocket_enabled: this.config.websocket?.enabled ?? true,
        adaptive_mode: this.config.scheduler?.adaptive_mode ?? true,
        node_version: process.version,
        platform: process.platform,
      });
    } catch (error) {
      this.logger.error('❌ Failed to initialize Amplitude:', error);
    }
  }

  /**
   * Track an event with properties
   */
  trackEvent(eventName: string, properties?: Record<string, any>): void {
    if (!this.initialized || !this.client) {
      return;
    }

    try {
      this.client.logEvent({
        event_type: eventName,
        user_id: this.config.edge.agent_id,
        event_properties: {
          ...properties,
          agent_id: this.config.edge.agent_id,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      this.logger.error(`❌ Failed to track event ${eventName}:`, error);
    }
  }

  /**
   * Set user properties
   */
  setUserProperties(properties: Record<string, any>): void {
    if (!this.initialized || !this.client) {
      return;
    }

    try {
      const identify = new Identify();

      for (const [key, value] of Object.entries(properties)) {
        identify.set(key, value);
      }

      this.client.identify(this.config.edge.agent_id, null, identify);
    } catch (error) {
      this.logger.error('❌ Failed to set user properties:', error);
    }
  }

  /**
   * Increment a user property
   */
  incrementUserProperty(property: string, value: number = 1): void {
    if (!this.initialized || !this.client) {
      return;
    }

    try {
      const identify = new Identify();
      identify.add(property, value);

      this.client.identify(this.config.edge.agent_id, null, identify);
    } catch (error) {
      this.logger.error(`❌ Failed to increment user property ${property}:`, error);
    }
  }

  /**
   * Track message received
   */
  trackMessageReceived(threadId: string, isGroup: boolean, hasAttachments: boolean): void {
    this.trackEvent('message_received', {
      thread_id: threadId,
      is_group: isGroup,
      has_attachments: hasAttachments,
    });

    this.incrementUserProperty('total_messages_received');
  }

  /**
   * Track message sent
   */
  trackMessageSent(threadId: string, isGroup: boolean, bubbleType: string, success: boolean): void {
    this.trackEvent('message_sent', {
      thread_id: threadId,
      is_group: isGroup,
      bubble_type: bubbleType,
      success,
    });

    if (success) {
      this.incrementUserProperty('total_messages_sent');
    } else {
      this.incrementUserProperty('total_messages_failed');
    }
  }

  /**
   * Track command processing
   */
  trackCommandProcessed(commandType: string, success: boolean, durationMs: number): void {
    this.trackEvent('command_processed', {
      command_type: commandType,
      success,
      duration_ms: durationMs,
    });

    this.incrementUserProperty(`commands_${commandType}_processed`);
  }

  /**
   * Track WebSocket connection status
   */
  trackWebSocketStatus(status: 'connected' | 'disconnected' | 'reconnecting' | 'failed', error?: string): void {
    this.trackEvent('websocket_status', {
      status,
      error,
      backend_url: this.config.backend.websocket_url || this.config.backend.url,
    });

    if (status === 'connected') {
      this.incrementUserProperty('websocket_connections');
    } else if (status === 'failed') {
      this.incrementUserProperty('websocket_failures');
    }
  }

  /**
   * Track scheduled message
   */
  trackScheduledMessage(sendAt: string, success: boolean): void {
    this.trackEvent('message_scheduled', {
      send_at: sendAt,
      success,
    });

    if (success) {
      this.incrementUserProperty('total_scheduled_messages');
    }
  }

  /**
   * Track rule execution
   */
  trackRuleExecution(ruleType: string, ruleName: string, matched: boolean): void {
    this.trackEvent('rule_executed', {
      rule_type: ruleType,
      rule_name: ruleName,
      matched,
    });

    if (matched) {
      this.incrementUserProperty(`rules_${ruleType}_matched`);
    }
  }

  /**
   * Track agent uptime (call periodically)
   */
  trackUptime(uptimeSeconds: number, stats: {
    messagesReceived: number;
    messagesSent: number;
    commandsProcessed: number;
    scheduledMessages: number;
  }): void {
    this.trackEvent('agent_uptime', {
      uptime_seconds: uptimeSeconds,
      uptime_hours: Math.floor(uptimeSeconds / 3600),
      ...stats,
    });
  }

  /**
   * Track system performance metrics
   */
  trackPerformanceMetrics(metrics: {
    memoryUsageMB: number;
    cpuPercent: number;
    activeTimers: number;
    activeIntervals: number;
    wsMessageTracked: number;
  }): void {
    this.trackEvent('performance_metrics', metrics);
  }

  /**
   * Track error occurrence
   */
  trackError(errorType: string, errorMessage: string, context?: Record<string, any>): void {
    this.trackEvent('error_occurred', {
      error_type: errorType,
      error_message: errorMessage,
      ...context,
    });

    this.incrementUserProperty('total_errors');
    this.incrementUserProperty(`errors_${errorType}`);
  }

  /**
   * Track feature usage
   */
  trackFeatureUsage(featureName: string, enabled: boolean): void {
    this.trackEvent('feature_usage', {
      feature_name: featureName,
      enabled,
    });

    this.setUserProperties({
      [`feature_${featureName}_enabled`]: enabled,
    });
  }

  /**
   * Flush all pending events
   */
  async flush(): Promise<void> {
    if (!this.initialized || !this.client) {
      return;
    }

    try {
      await this.client.flush();
      this.logger.info('✅ Amplitude events flushed');
    } catch (error) {
      this.logger.error('❌ Failed to flush Amplitude events:', error);
    }
  }

  /**
   * Shutdown Amplitude client
   */
  async shutdown(): Promise<void> {
    if (!this.initialized || !this.client) {
      return;
    }

    try {
      // Track agent stopped event before shutdown
      this.trackEvent('agent_stopped', {
        agent_id: this.config.edge.agent_id,
      });

      // Flush all pending events
      await this.flush();

      this.initialized = false;
      this.client = null;
      this.logger.info('✅ Amplitude analytics shutdown');
    } catch (error) {
      this.logger.error('❌ Failed to shutdown Amplitude:', error);
    }
  }

  /**
   * Check if Amplitude is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}
