import axios, { AxiosInstance } from 'axios';
import http from 'http';
import https from 'https';
import { IBackendClient, BackendMessageRequest, BackendMessageResponse, PhotoUploadRequest, PhotoUploadResponse } from '../interfaces/IBackendClient';
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
  private edgeAgentId: string;

  constructor(
    private backendUrl: string,
    userPhone: string,
    edgeSecret: string,
    edgeAgentId: string,
    logger: ILogger
  ) {
    this.userPhone = userPhone;
    this.edgeSecret = edgeSecret;
    this.edgeAgentId = edgeAgentId;
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
    // Return the agent ID from config (no longer auto-generated)
    return this.edgeAgentId;
  }

  /**
   * Send a message to the backend for processing
   * Uses the /edge/message endpoint with Bearer auth (WebSocket-aware)
   */
  async sendMessage(request: BackendMessageRequest): Promise<BackendMessageResponse> {
    const requestId = `msg_${Date.now()}`;
    const textPreview = request.text.substring(0, 50);

    this.logger.info(`[${requestId}] 📤 Sending message to backend from ${request.sender} (${request.mode} chat)`);
    this.logger.debug(`[${requestId}] Text preview: ${textPreview}`);

    const maxRetries = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const startTime = Date.now();
      const startTimestamp = new Date().toISOString();

      this.logger.info(`[${requestId}] 🔄 POST /edge/message attempt ${attempt} started at ${startTimestamp}`);

      try {
        // Include edge agent ID header so backend knows which WebSocket to use for reflex delivery
        const headers: any = {};
        if (this.edgeAgentId) {
          headers['X-Edge-Agent-Id'] = this.edgeAgentId;
          this.logger.debug(`[${requestId}] Including header: X-Edge-Agent-Id: ${this.edgeAgentId}`);
        } else {
          this.logger.warn(`[${requestId}] ⚠️ No edge agent ID set - backend won't be able to correlate WebSocket!`);
        }

        const response = await this.client.post('/edge/message', request, { headers });
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
          this.logger.error(`[${requestId}] ❌ Authentication failed - check EDGE_SECRET matches backend`);
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
   * Upload a photo attachment using multipart/form-data
   */
  async uploadPhoto(request: PhotoUploadRequest): Promise<PhotoUploadResponse> {
    const uploadId = `upload_${Date.now()}`;
    this.logger.info(`[${uploadId}] 📸 Starting photo upload (guid=${request.attachment_guid})`);

    const headers: any = {};
    if (this.edgeAgentId) {
      headers['X-Edge-Agent-Id'] = this.edgeAgentId;
    }

    // Convert base64 to Buffer
    const photoBuffer = Buffer.from(request.photo_data, 'base64');
    this.logger.debug(`[${uploadId}] Photo buffer size: ${photoBuffer.length} bytes`);

    // Determine file extension from mime type
    let extension = '.jpg';
    if (request.mime_type === 'image/png') {
      extension = '.png';
    } else if (request.mime_type === 'image/gif') {
      extension = '.gif';
    } else if (request.mime_type?.includes('heic')) {
      extension = '.heic';
    }

    const filename = request.attachment_guid ? `${request.attachment_guid}${extension}` : `photo_${Date.now()}${extension}`;
    this.logger.debug(`[${uploadId}] Filename: ${filename}, Content-Type: ${request.mime_type || 'image/jpeg'}`);

    // Create FormData for multipart upload
    const FormData = require('form-data');
    const formData = new FormData();

    formData.append('file', photoBuffer, {
      filename,
      contentType: request.mime_type || 'image/jpeg'
    });
    formData.append('user_phone', request.user_phone);
    formData.append('edge_agent_id', request.edge_agent_id);

    this.logger.debug(`[${uploadId}] Form data: user_phone=${request.user_phone}, edge_agent_id=${request.edge_agent_id}`);

    if (request.attachment_guid) {
      formData.append('attachment_guid', request.attachment_guid);
    }

    if (request.context) {
      formData.append('context', JSON.stringify(request.context));
    }

    // Group photo handling - pass chat context for deferred processing
    if (request.chat_guid) {
      formData.append('chat_guid', request.chat_guid);
    }

    if (request.is_group !== undefined) {
      formData.append('is_group', String(request.is_group).toLowerCase());
    }

    if (request.caption) {
      formData.append('caption', request.caption);
    }

    // Merge FormData headers with our custom headers
    const uploadHeaders = {
      ...headers,
      ...formData.getHeaders()
    };

    this.logger.debug(`[${uploadId}] Upload headers:`, uploadHeaders);

    try {
      const response = await this.client.post('/photo/upload', formData, {
        headers: uploadHeaders
      });
      const status = response.data.status || 'processing';
      if (status === 'stored') {
        this.logger.info(`[${uploadId}] 📦 Photo stored for deferred processing (photo_id=${response.data.photo_id}, group photo without Sage mention)`);
      } else {
        this.logger.info(`[${uploadId}] ✅ Photo upload successful (photo_id=${response.data.photo_id}, status=${status})`);
      }
      return response.data;
    } catch (error: any) {
      this.logger.error(`[${uploadId}] ❌ Photo upload failed`);
      if (error.response?.data) {
        this.logger.error(`[${uploadId}] Backend error details:`, JSON.stringify(error.response.data));
      }
      throw error;
    }
  }

  /**
   * Sync with backend - send events and receive commands
   * NOTE: This is deprecated in the new WebSocket-based architecture.
   * Kept for backward compatibility but returns empty response.
   */
  async sync(request: SyncRequest): Promise<SyncResponse> {
    // No-op in new WebSocket architecture - commands come via WebSocket
    // Silently return empty response to avoid log spam
    return {
      commands: [],
      ack_events: []
    };
  }

  /**
   * Acknowledge command execution
   * NOTE: This is deprecated - acknowledgments now sent via WebSocket.
   * Kept for backward compatibility but does nothing.
   */
  async acknowledgeCommand(
    commandId: string,
    success: boolean,
    error?: string
  ): Promise<void> {
    // No-op - acknowledgments now sent via WebSocket
    // Silently return to avoid log spam
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
    return this.edgeAgentId;
  }
}
