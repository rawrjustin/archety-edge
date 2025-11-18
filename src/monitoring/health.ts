import express, { Request, Response } from 'express';
import { Server } from 'http';
import { Config } from '../types/config.types';
import { ILogger } from '../interfaces/ILogger';

/**
 * Health Check Server
 * Provides HTTP endpoint for monitoring agent status and health
 */
export class HealthCheckServer {
  private logger: ILogger;
  private config: Config;
  private app: express.Application;
  private server: Server | null = null;
  private startTime: Date = new Date();
  private isRunning: boolean = false;

  // Health metrics (updated by EdgeAgent)
  private metrics = {
    messagesReceived: 0,
    messagesSent: 0,
    commandsProcessed: 0,
    scheduledMessages: 0,
    websocketConnected: false,
    lastMessageTime: null as Date | null,
    lastCommandTime: null as Date | null,
  };

  constructor(config: Config, logger: ILogger) {
    this.config = config;
    this.logger = logger;
    this.app = express();
  }

  /**
   * Start the health check server
   */
  start(): void {
    const healthConfig = this.config.monitoring?.health_check;

    if (!healthConfig?.enabled) {
      this.logger.info('Health check endpoint disabled');
      return;
    }

    const port = healthConfig.port || 3001;

    try {
      // Configure middleware
      this.app.use(express.json());

      // Health check endpoint
      this.app.get('/health', (req: Request, res: Response) => {
        const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

        const health = {
          status: this.isRunning ? 'healthy' : 'starting',
          timestamp: new Date().toISOString(),
          uptime_seconds: uptime,
          uptime_hours: (uptime / 3600).toFixed(2),
          agent: {
            id: this.config.edge.agent_id,
            phone: this.config.edge.user_phone,
          },
          metrics: {
            messages_received: this.metrics.messagesReceived,
            messages_sent: this.metrics.messagesSent,
            commands_processed: this.metrics.commandsProcessed,
            scheduled_messages: this.metrics.scheduledMessages,
            last_message_time: this.metrics.lastMessageTime?.toISOString() || null,
            last_command_time: this.metrics.lastCommandTime?.toISOString() || null,
          },
          connectivity: {
            websocket_connected: this.metrics.websocketConnected,
            backend_url: this.config.backend.url,
          },
          system: {
            node_version: process.version,
            platform: process.platform,
            memory_mb: Math.floor(process.memoryUsage().heapUsed / 1024 / 1024),
          },
        };

        res.status(200).json(health);
      });

      // Readiness check endpoint (for Kubernetes-style readiness probes)
      this.app.get('/ready', (req: Request, res: Response) => {
        if (this.isRunning) {
          res.status(200).json({
            status: 'ready',
            timestamp: new Date().toISOString(),
          });
        } else {
          res.status(503).json({
            status: 'not_ready',
            timestamp: new Date().toISOString(),
          });
        }
      });

      // Liveness check endpoint (for Kubernetes-style liveness probes)
      this.app.get('/live', (req: Request, res: Response) => {
        res.status(200).json({
          status: 'alive',
          timestamp: new Date().toISOString(),
        });
      });

      // Metrics endpoint (Prometheus-style format)
      this.app.get('/metrics', (req: Request, res: Response) => {
        const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
        const memoryMB = Math.floor(process.memoryUsage().heapUsed / 1024 / 1024);

        // Simple Prometheus-compatible text format
        const metrics = [
          `# HELP edge_agent_uptime_seconds Agent uptime in seconds`,
          `# TYPE edge_agent_uptime_seconds gauge`,
          `edge_agent_uptime_seconds ${uptime}`,
          ``,
          `# HELP edge_agent_messages_received_total Total messages received`,
          `# TYPE edge_agent_messages_received_total counter`,
          `edge_agent_messages_received_total ${this.metrics.messagesReceived}`,
          ``,
          `# HELP edge_agent_messages_sent_total Total messages sent`,
          `# TYPE edge_agent_messages_sent_total counter`,
          `edge_agent_messages_sent_total ${this.metrics.messagesSent}`,
          ``,
          `# HELP edge_agent_commands_processed_total Total commands processed`,
          `# TYPE edge_agent_commands_processed_total counter`,
          `edge_agent_commands_processed_total ${this.metrics.commandsProcessed}`,
          ``,
          `# HELP edge_agent_scheduled_messages_total Total scheduled messages`,
          `# TYPE edge_agent_scheduled_messages_total counter`,
          `edge_agent_scheduled_messages_total ${this.metrics.scheduledMessages}`,
          ``,
          `# HELP edge_agent_websocket_connected WebSocket connection status (1=connected, 0=disconnected)`,
          `# TYPE edge_agent_websocket_connected gauge`,
          `edge_agent_websocket_connected ${this.metrics.websocketConnected ? 1 : 0}`,
          ``,
          `# HELP edge_agent_memory_mb Memory usage in MB`,
          `# TYPE edge_agent_memory_mb gauge`,
          `edge_agent_memory_mb ${memoryMB}`,
        ].join('\n');

        res.set('Content-Type', 'text/plain; version=0.0.4');
        res.status(200).send(metrics);
      });

      // Start server
      this.server = this.app.listen(port, () => {
        this.logger.info(`✅ Health check server listening on port ${port}`);
        this.logger.info(`   Endpoints: /health, /ready, /live, /metrics`);
      });

      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          this.logger.error(`❌ Port ${port} is already in use`);
        } else {
          this.logger.error('❌ Health check server error:', error);
        }
      });
    } catch (error) {
      this.logger.error('❌ Failed to start health check server:', error);
    }
  }

  /**
   * Stop the health check server
   */
  stop(): void {
    if (this.server) {
      this.server.close(() => {
        this.logger.info('✅ Health check server stopped');
      });
      this.server = null;
    }
  }

  /**
   * Mark agent as running (affects readiness check)
   */
  setRunning(running: boolean): void {
    this.isRunning = running;
  }

  /**
   * Update metrics from EdgeAgent
   */
  updateMetrics(metrics: {
    messagesReceived?: number;
    messagesSent?: number;
    commandsProcessed?: number;
    scheduledMessages?: number;
    websocketConnected?: boolean;
  }): void {
    if (metrics.messagesReceived !== undefined) {
      this.metrics.messagesReceived = metrics.messagesReceived;
      this.metrics.lastMessageTime = new Date();
    }
    if (metrics.messagesSent !== undefined) {
      this.metrics.messagesSent = metrics.messagesSent;
    }
    if (metrics.commandsProcessed !== undefined) {
      this.metrics.commandsProcessed = metrics.commandsProcessed;
      this.metrics.lastCommandTime = new Date();
    }
    if (metrics.scheduledMessages !== undefined) {
      this.metrics.scheduledMessages = metrics.scheduledMessages;
    }
    if (metrics.websocketConnected !== undefined) {
      this.metrics.websocketConnected = metrics.websocketConnected;
    }
  }

  /**
   * Increment a metric counter
   */
  incrementMetric(metric: 'messagesReceived' | 'messagesSent' | 'commandsProcessed' | 'scheduledMessages'): void {
    this.metrics[metric]++;

    if (metric === 'messagesReceived') {
      this.metrics.lastMessageTime = new Date();
    } else if (metric === 'commandsProcessed') {
      this.metrics.lastCommandTime = new Date();
    }
  }

  /**
   * Update WebSocket connection status
   */
  setWebSocketConnected(connected: boolean): void {
    this.metrics.websocketConnected = connected;
  }
}
