import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import { IBackendClient, BackendMessageRequest, BackendMessageResponse } from '../interfaces/IBackendClient';
import { SyncRequest, SyncResponse } from '../interfaces/ICommands';
import { EdgeAuth } from './auth';
import { ILogger } from '../interfaces/ILogger';

/**
 * RenderClient - Backend client for communicating with Sage backend on Render
 */
export class RenderClient implements IBackendClient {
  private client: AxiosInstance;
  private auth: EdgeAuth;
  private logger: ILogger;

  constructor(
    private backendUrl: string,
    private userPhone: string,
    private secret: string,
    logger: ILogger
  ) {
    this.auth = new EdgeAuth(userPhone, secret);
    this.logger = logger;

    // OPTIMIZATION: Create axios instance with connection pooling
    // Reuses TCP connections for better performance (20-30% latency reduction)
    this.client = axios.create({
      baseURL: backendUrl,
      timeout: 60000, // 60 seconds (LLM processing can be slow, especially on cold starts)
      headers: {
        'Content-Type': 'application/json'
      },
      // HTTP connection pooling for better performance
      httpAgent: new http.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 5,
        maxFreeSockets: 2
      }),
      httpsAgent: new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 30000,
        maxSockets: 5,
        maxFreeSockets: 2
      })
    });

    // Add request interceptor for authentication
    this.client.interceptors.request.use(
      (config) => {
        if (this.auth.hasValidToken()) {
          const authHeaders = this.auth.getAuthHeaders();
          Object.entries(authHeaders).forEach(([key, value]) => {
            config.headers.set(key, value);
          });
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        this.logger.error('Backend request failed:', error.message);
        if (error.response) {
          this.logger.error('Response status:', error.response.status);
          this.logger.error('Response data:', error.response.data);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Register this edge agent with the backend
   */
  async register(): Promise<string> {
    this.logger.info('Registering edge agent with backend...');

    try {
      const registrationToken = process.env.REGISTRATION_TOKEN || 'edge_manual_token';

      const response = await this.client.post('/edge/register', {
        user_phone: this.userPhone,
        apple_id: null, // Optional
        version: '2.0.0',
        capabilities: ['transport', 'scheduler'], // Phase 2: transport + scheduler
        auth_token: registrationToken
      });

      const { edge_agent_id } = response.data;
      this.logger.info(`Registered as edge agent: ${edge_agent_id}`);

      // Set agent ID in auth system
      this.auth.setEdgeAgentId(edge_agent_id);

      return edge_agent_id;
    } catch (error: any) {
      this.logger.error('Registration failed:', error.message);
      throw new Error(`Failed to register edge agent: ${error.message}`);
    }
  }

  /**
   * Send a message to the backend for processing
   */
  async sendMessage(request: BackendMessageRequest): Promise<BackendMessageResponse> {
    const requestId = `msg_${Date.now()}`;
    const textPreview = request.filtered_text.substring(0, 50);

    this.logger.info(`[${requestId}] 📤 Sending message to backend from ${request.sender}`);
    this.logger.debug(`[${requestId}] Text preview: ${textPreview}`);

    // Retry logic for connection issues (Render.com cold starts)
    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      const startTimestamp = new Date().toISOString();

      this.logger.info(`[${requestId}] 🔄 POST /edge/message attempt ${attempt} started at ${startTimestamp}`);

      try {
        const response = await this.client.post('/edge/message', request);
        const duration = Date.now() - startTime;
        const endTimestamp = new Date().toISOString();

        this.logger.info(`[${requestId}] ✅ Backend response received in ${duration}ms (ended at ${endTimestamp})`);
        this.logger.debug(`[${requestId}] Response data:`, response.data);

        return {
          should_respond: response.data.should_respond,
          reply_text: response.data.reply_text,
          reply_bubbles: response.data.reply_bubbles,  // Multi-bubble support
          reflex_message: response.data.reflex_message,  // Fast reflex support
          burst_messages: response.data.burst_messages,
          burst_delay_ms: response.data.burst_delay_ms
        };
      } catch (error: any) {
        lastError = error;
        const duration = Date.now() - startTime;
        const endTimestamp = new Date().toISOString();

        // Check if it's a connection error (likely Render cold start)
        const isConnectionError = error.code === 'ECONNRESET' ||
                                  error.code === 'ECONNREFUSED';

        // Don't retry on timeout - backend is processing, just too slow
        const isTimeout = error.code === 'ECONNABORTED' ||
                         error.message?.includes('timeout');

        this.logger.error(`[${requestId}] ❌ Request failed after ${duration}ms (ended at ${endTimestamp})`);

        if (isConnectionError && attempt < maxRetries) {
          this.logger.warn(`[${requestId}] ⚠️  Attempt ${attempt} failed (${error.code}), retrying in ${5000 * attempt}ms...`);
          // Wait before retry (Render cold start can take 30-60s)
          await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
          continue;
        }

        // Log error details
        this.logger.error(`[${requestId}] Error message: ${error.message}`);
        if (error.code) {
          this.logger.error(`[${requestId}] Error code: ${error.code}`);
        }
        if (isTimeout) {
          this.logger.error(`[${requestId}] ⚠️  Backend took longer than 60s to respond - this is a backend performance issue`);
        }
        if (error.response) {
          this.logger.error(`[${requestId}] Response status: ${error.response.status}`);
          this.logger.error(`[${requestId}] Response data: ${JSON.stringify(error.response.data)}`);
        }

        break;
      }
    }

    this.logger.warn(`[${requestId}] 🚫 All attempts failed, returning empty response`);

    // Return safe default response on error
    return {
      should_respond: false
    };
  }

  /**
   * Sync with backend - send events and receive commands
   */
  async sync(request: SyncRequest): Promise<SyncResponse> {
    const syncId = `sync_${Date.now()}`;

    this.logger.info(`[${syncId}] 🔄 Starting sync with backend (${request.pending_events.length} pending events)`);

    // Retry logic for connection issues (Render.com cold starts)
    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      const startTimestamp = new Date().toISOString();

      this.logger.info(`[${syncId}] 🔄 POST /edge/sync attempt ${attempt} started at ${startTimestamp}`);

      try {
        const response = await this.client.post('/edge/sync', request);
        const duration = Date.now() - startTime;
        const endTimestamp = new Date().toISOString();

        const numCommands = response.data.commands?.length || 0;
        const numAcks = response.data.ack_events?.length || 0;

        this.logger.info(`[${syncId}] ✅ Sync completed in ${duration}ms (ended at ${endTimestamp})`);
        this.logger.info(`[${syncId}] Received ${numCommands} commands, ${numAcks} acks`);

        return {
          commands: response.data.commands || [],
          ack_events: response.data.ack_events || [],
          config_updates: response.data.config_updates
        };
      } catch (error: any) {
        lastError = error;
        const duration = Date.now() - startTime;
        const endTimestamp = new Date().toISOString();

        // Check if it's a connection error (likely Render cold start)
        const isConnectionError = error.code === 'ECONNRESET' ||
                                  error.code === 'ETIMEDOUT' ||
                                  error.code === 'ECONNREFUSED';

        const isTimeout = error.code === 'ECONNABORTED' ||
                         error.message?.includes('timeout');

        this.logger.error(`[${syncId}] ❌ Sync failed after ${duration}ms (ended at ${endTimestamp})`);

        if (isConnectionError && attempt < maxRetries) {
          this.logger.warn(`[${syncId}] ⚠️  Attempt ${attempt} failed (${error.code}), retrying in ${5000 * attempt}ms...`);
          // Wait before retry (Render cold start can take 30-60s)
          await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
          continue;
        }

        // Log error details
        this.logger.error(`[${syncId}] Error message: ${error.message}`);
        if (error.code) {
          this.logger.error(`[${syncId}] Error code: ${error.code}`);
        }
        if (isTimeout) {
          this.logger.error(`[${syncId}] ⚠️  Backend took longer than 60s to respond - this is a backend performance issue`);
        }
        if (error.response) {
          this.logger.error(`[${syncId}] Response status: ${error.response.status}`);
          this.logger.error(`[${syncId}] Response data: ${JSON.stringify(error.response.data)}`);
        }

        break;
      }
    }

    this.logger.warn(`[${syncId}] 🚫 All sync attempts failed, returning empty response`);

    // Return empty response on error
    return {
      commands: [],
      ack_events: []
    };
  }

  /**
   * Acknowledge command execution
   */
  async acknowledgeCommand(
    commandId: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    this.logger.debug('Acknowledging command:', commandId);

    try {
      await this.client.post('/edge/command/ack', {
        command_id: commandId,
        success,
        error: error || null,
        timestamp: new Date().toISOString()
      });

      this.logger.debug('Command acknowledged:', commandId);
    } catch (error: any) {
      this.logger.error('Failed to acknowledge command:', error.message);
      // Don't throw - acknowledgment failures shouldn't break the flow
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      this.logger.warn('Backend health check failed');
      return false;
    }
  }

  /**
   * Get current edge agent ID
   */
  getEdgeAgentId(): string | null {
    return this.auth.getEdgeAgentId();
  }
}
