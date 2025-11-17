import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import { IBackendClient, BackendMessageRequest, BackendMessageResponse } from '../interfaces/IBackendClient';
import { SyncRequest, SyncResponse } from '../interfaces/ICommands';
import { ILogger } from '../interfaces/ILogger';

/**
 * RailwayClient - Backend client for communicating with Sage backend on Railway
 *
 * Updated November 2025 for new backend architecture:
 * - Bearer token authentication (EDGE_SECRET - same for HTTP and WebSocket)
 * - /edge/message endpoint (WebSocket-aware)
 * - No registration needed
 * - Rate limiting support (429 handling)
 */
export class RailwayClient implements IBackendClient {
  private client: AxiosInstance;
  private logger: ILogger;
  private edgeSecret: string;
  private userPhone: string;

  constructor(
    private backendUrl: string,
    userPhone: string,
    edgeSecret: string,
    logger: ILogger
  ) {
    this.userPhone = userPhone;
    this.edgeSecret = edgeSecret;
    this.logger = logger;

    // Create axios instance with connection pooling and Bearer auth
    this.client = axios.create({
      baseURL: backendUrl,
      timeout: 60000, // 60 seconds (LLM processing can be slow)
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.edgeSecret}`
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

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          this.logger.error('❌ Authentication failed - check EDGE_SECRET');
        } else if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 60;
          this.logger.warn(`⚠️ Rate limited - retry after ${retryAfter}s`);
        } else {
          this.logger.error('Backend request failed:', error.message);
        }

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
   * NOTE: Registration is no longer required in the new architecture.
   * This method is kept for backward compatibility but does nothing.
   */
  async register(): Promise<string> {
    this.logger.info('📝 Registration not required in new backend architecture');
    // Generate a simple agent ID from phone number
    const phoneDigits = this.userPhone.replace(/[^0-9]/g, '');
    return `edge_${phoneDigits}`;
  }

  /**
   * Send a message to the backend for processing
   * Uses the /edge/message endpoint with Bearer auth (WebSocket-aware)
   */
  async sendMessage(request: BackendMessageRequest): Promise<BackendMessageResponse> {
    const requestId = `msg_${Date.now()}`;
    const textPreview = request.filtered_text.substring(0, 50);

    this.logger.info(`[${requestId}] 📤 Sending message to backend from ${request.sender}`);
    this.logger.debug(`[${requestId}] Text preview: ${textPreview}`);

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
          reply_bubbles: response.data.reply_bubbles,
          reflex_message: response.data.reflex_message,
          burst_messages: response.data.burst_messages,
          burst_delay_ms: response.data.burst_delay_ms
        };
      } catch (error: any) {
        lastError = error;
        const duration = Date.now() - startTime;
        const endTimestamp = new Date().toISOString();

        // Handle 401 Unauthorized - authentication failed
        if (error.response?.status === 401) {
          this.logger.error(`[${requestId}] ❌ Authentication failed - check RELAY_WEBHOOK_SECRET matches backend`);
          break; // Don't retry auth errors
        }

        // Handle 429 Rate Limit - too many requests
        if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 60;
          this.logger.warn(`[${requestId}] ⚠️ Rate limited - should retry after ${retryAfter}s`);
          // Note: We don't auto-retry here, let the caller handle rate limits
          break;
        }

        // Check if it's a connection error (cold start)
        const isConnectionError = error.code === 'ECONNRESET' ||
                                  error.code === 'ECONNREFUSED';

        const isTimeout = error.code === 'ECONNABORTED' ||
                         error.message?.includes('timeout');

        this.logger.error(`[${requestId}] ❌ Request failed after ${duration}ms (ended at ${endTimestamp})`);

        if (isConnectionError && attempt < maxRetries) {
          this.logger.warn(`[${requestId}] ⚠️  Attempt ${attempt} failed (${error.code}), retrying in ${5000 * attempt}ms...`);
          await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
          continue;
        }

        // Log error details
        this.logger.error(`[${requestId}] Error message: ${error.message}`);
        if (error.code) {
          this.logger.error(`[${requestId}] Error code: ${error.code}`);
        }
        if (isTimeout) {
          this.logger.error(`[${requestId}] ⚠️  Backend took longer than 60s to respond`);
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
   * NOTE: The new backend architecture may not use this endpoint.
   * Keeping for backward compatibility.
   */
  async sync(request: SyncRequest): Promise<SyncResponse> {
    const syncId = `sync_${Date.now()}`;
    this.logger.info(`[${syncId}] 🔄 Sync called (may not be supported in new backend)`);

    // Return empty response - sync might not be needed in new architecture
    return {
      commands: [],
      ack_events: []
    };
  }

  /**
   * Acknowledge command execution
   * NOTE: Command acknowledgment may not be needed in new architecture.
   * Keeping for backward compatibility.
   */
  async acknowledgeCommand(
    commandId: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    this.logger.debug(`Acknowledge command ${commandId} (may not be supported in new backend)`);
    // No-op in new architecture
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
    // Generate from phone number
    const phoneDigits = this.userPhone.replace(/[^0-9]/g, '');
    return `edge_${phoneDigits}`;
  }
}
