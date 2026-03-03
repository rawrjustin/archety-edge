import { PostHog } from 'posthog-node';
import { Config } from '../types/config.types';
import { ILogger } from '../interfaces/ILogger';

/**
 * PostHog Integration for Product Analytics & Feature Flags
 * Replaces Amplitude with consolidated 10-event schema.
 * All events prefixed `edge_` to distinguish from backend events.
 */
export class PostHogAnalytics {
  private logger: ILogger;
  private config: Config;
  private client: PostHog | null = null;
  private initialized: boolean = false;
  private distinctId: string;

  constructor(config: Config, logger: ILogger) {
    this.config = config;
    this.logger = logger;
    this.distinctId = config.edge.agent_id;
  }

  /**
   * Initialize PostHog with configuration
   */
  initialize(): void {
    if (this.initialized) {
      this.logger.warn('PostHog already initialized');
      return;
    }

    const posthogConfig = this.config.monitoring?.posthog;

    if (!posthogConfig?.enabled || !posthogConfig.api_key) {
      this.logger.info('PostHog analytics disabled (not configured)');
      return;
    }

    try {
      this.client = new PostHog(posthogConfig.api_key, {
        host: posthogConfig.host || 'https://us.i.posthog.com',
        flushAt: 20,
        flushInterval: posthogConfig.flush_interval_ms || 10000,
      });

      this.initialized = true;
      this.logger.info('PostHog analytics initialized');

      // Track agent started event
      this.trackAgentStarted();
    } catch (error) {
      this.logger.error('Failed to initialize PostHog:', error);
    }
  }

  // ========================
  // 10 Consolidated Events
  // ========================

  /**
   * 1. edge_agent_started — Uptime/deploy monitoring
   */
  trackAgentStarted(): void {
    this.capture('edge_agent_started', {
      persona_id: this.config.edge.persona_id,
      backend_url: this.config.backend.url,
      websocket_enabled: this.config.websocket?.enabled ?? true,
      adaptive_mode: this.config.scheduler?.adaptive_mode ?? true,
      node_version: process.version,
      platform: process.platform,
    });
  }

  /**
   * 2. edge_agent_stopped — Crash/restart detection
   */
  trackAgentStopped(): void {
    this.capture('edge_agent_stopped', {});
  }

  /**
   * 3. edge_message_relayed — Core throughput metric
   *    Combines old message_received + message_sent into one event with direction property.
   */
  trackMessageRelayed(
    direction: 'inbound' | 'outbound',
    threadId: string,
    isGroup: boolean,
    properties?: {
      hasAttachments?: boolean;
      bubbleType?: string;
      success?: boolean;
    }
  ): void {
    this.capture('edge_message_relayed', {
      direction,
      thread_id: threadId,
      is_group: isGroup,
      ...properties,
    });
  }

  /**
   * 4. edge_command_processed — Backend→edge command health
   */
  trackCommandProcessed(commandType: string, success: boolean, durationMs: number): void {
    this.capture('edge_command_processed', {
      command_type: commandType,
      success,
      duration_ms: durationMs,
    });
  }

  /**
   * 5. edge_websocket_status — Connection reliability
   */
  trackWebSocketStatus(status: 'connected' | 'disconnected' | 'reconnecting' | 'failed', error?: string): void {
    this.capture('edge_websocket_status', {
      status,
      error,
      backend_url: this.config.backend.websocket_url || this.config.backend.url,
    });
  }

  /**
   * 6. edge_photo_upload — Combines started/completed/failed into one event with status property
   */
  trackPhotoUpload(
    status: 'started' | 'completed' | 'failed',
    attachmentGuid: string,
    properties?: {
      mimeType?: string;
      sizeBytes?: number;
      threadId?: string;
      photoId?: string;
      uploadDurationMs?: number;
      errorReason?: string;
    }
  ): void {
    this.capture('edge_photo_upload', {
      status,
      attachment_guid: attachmentGuid,
      mime_type: properties?.mimeType,
      size_bytes: properties?.sizeBytes,
      thread_id: properties?.threadId,
      photo_id: properties?.photoId,
      upload_duration_ms: properties?.uploadDurationMs,
      error_reason: properties?.errorReason,
    });
  }

  /**
   * 7. edge_error — Error monitoring
   */
  trackError(errorType: string, errorMessage: string, context?: Record<string, any>): void {
    this.capture('edge_error', {
      error_type: errorType,
      error_message: errorMessage,
      ...context,
    });
  }

  /**
   * 8. edge_scheduled_message — Combines scheduled + executed into one event with status property
   */
  trackScheduledMessage(
    status: 'scheduled' | 'executed' | 'failed',
    properties?: {
      sendAt?: string;
      scheduledTime?: string;
      actualTime?: string;
      latencyMs?: number;
      success?: boolean;
    }
  ): void {
    this.capture('edge_scheduled_message', {
      status,
      ...properties,
    });
  }

  /**
   * 9. edge_uptime — Periodic health heartbeat
   */
  trackUptime(uptimeSeconds: number, stats: {
    messagesReceived: number;
    messagesSent: number;
    commandsProcessed: number;
    scheduledMessages: number;
  }): void {
    this.capture('edge_uptime', {
      uptime_seconds: uptimeSeconds,
      uptime_hours: Math.floor(uptimeSeconds / 3600),
      ...stats,
    });
  }

  /**
   * 10. edge_performance — Memory/CPU monitoring
   */
  trackPerformance(metrics: {
    memoryUsageMB: number;
    cpuPercent: number;
    activeTimers: number;
    activeIntervals: number;
    wsMessageTracked: number;
  }): void {
    this.capture('edge_performance', metrics);
  }

  // ========================
  // Feature Flags
  // ========================

  /**
   * Evaluate a boolean feature flag
   */
  async getFlag(key: string, defaultValue: boolean = false): Promise<boolean> {
    if (!this.initialized || !this.client) {
      return defaultValue;
    }

    try {
      const value = await this.client.isFeatureEnabled(key, this.distinctId);
      return value ?? defaultValue;
    } catch (error) {
      this.logger.error(`Failed to evaluate flag ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * Get a config value from a feature flag (string/number payload)
   */
  async getConfig<T = string | number | boolean>(key: string, defaultValue: T): Promise<T> {
    if (!this.initialized || !this.client) {
      return defaultValue;
    }

    try {
      const payload = await this.client.getFeatureFlagPayload(key, this.distinctId);
      if (payload !== undefined && payload !== null) {
        return payload as T;
      }
      const flagValue = await this.client.getFeatureFlag(key, this.distinctId);
      if (flagValue !== undefined && flagValue !== null && flagValue !== false) {
        return flagValue as T;
      }
      return defaultValue;
    } catch (error) {
      this.logger.error(`Failed to get config ${key}:`, error);
      return defaultValue;
    }
  }

  // ========================
  // Lifecycle
  // ========================

  /**
   * Flush all pending events
   */
  async flush(): Promise<void> {
    if (!this.initialized || !this.client) {
      return;
    }

    try {
      await this.client.flush();
      this.logger.info('PostHog events flushed');
    } catch (error) {
      this.logger.error('Failed to flush PostHog events:', error);
    }
  }

  /**
   * Shutdown PostHog client
   */
  async shutdown(): Promise<void> {
    if (!this.initialized || !this.client) {
      return;
    }

    try {
      this.trackAgentStopped();
      await this.client.shutdown();
      this.initialized = false;
      this.client = null;
      this.logger.info('PostHog analytics shutdown');
    } catch (error) {
      this.logger.error('Failed to shutdown PostHog:', error);
    }
  }

  /**
   * Check if PostHog is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ========================
  // Internal
  // ========================

  private capture(event: string, properties: Record<string, any>): void {
    if (!this.initialized || !this.client) {
      return;
    }

    try {
      // Strip undefined values
      const cleaned: Record<string, any> = {};
      for (const [key, value] of Object.entries(properties)) {
        if (value !== undefined) {
          cleaned[key] = value;
        }
      }

      this.client.capture({
        distinctId: this.distinctId,
        event,
        properties: {
          ...cleaned,
          agent_id: this.distinctId,
          persona_id: this.config.edge.persona_id,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to capture event ${event}:`, error);
    }
  }
}
