import axios, { AxiosInstance } from 'axios';
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

    // Create axios instance
    this.client = axios.create({
      baseURL: backendUrl,
      timeout: 30000, // 30 seconds
      headers: {
        'Content-Type': 'application/json'
      }
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
    this.logger.debug('Sending message to backend:', {
      thread_id: request.thread_id,
      sender: request.sender,
      text_preview: request.filtered_text.substring(0, 50)
    });

    try {
      const response = await this.client.post('/edge/message', request);

      this.logger.debug('Backend response:', response.data);

      return {
        should_respond: response.data.should_respond,
        reply_text: response.data.reply_text,
        reply_bubbles: response.data.reply_bubbles  // NEW: Multi-bubble support
      };
    } catch (error: any) {
      this.logger.error('Failed to send message to backend:', error.message);

      // Return safe default response
      return {
        should_respond: false
      };
    }
  }

  /**
   * Sync with backend - send events and receive commands
   */
  async sync(request: SyncRequest): Promise<SyncResponse> {
    this.logger.debug('Syncing with backend:', {
      edge_agent_id: request.edge_agent_id,
      pending_events: request.pending_events.length
    });

    try {
      const response = await this.client.post('/edge/sync', request);

      this.logger.debug('Sync response:', {
        commands: response.data.commands?.length || 0,
        ack_events: response.data.ack_events?.length || 0
      });

      return {
        commands: response.data.commands || [],
        ack_events: response.data.ack_events || [],
        config_updates: response.data.config_updates
      };
    } catch (error: any) {
      this.logger.error('Failed to sync with backend:', error.message);

      // Return empty response on error
      return {
        commands: [],
        ack_events: []
      };
    }
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
