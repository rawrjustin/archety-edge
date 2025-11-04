import { RenderClient } from '../../src/backend/RenderClient';
import { MockLogger } from '../mocks/MockLogger';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RenderClient', () => {
  let client: RenderClient;
  let mockLogger: MockLogger;
  const backendUrl = 'https://api.example.com';
  const userPhone = '+15551234567';
  const secret = 'test-secret';

  // Mock axios instance
  let mockAxiosInstance: any;

  beforeEach(() => {
    mockLogger = new MockLogger();

    // Create mock axios instance
    mockAxiosInstance = {
      post: jest.fn(),
      get: jest.fn(),
      interceptors: {
        request: {
          use: jest.fn((onFulfilled, onRejected) => {
            mockAxiosInstance._requestInterceptor = { onFulfilled, onRejected };
          })
        },
        response: {
          use: jest.fn((onFulfilled, onRejected) => {
            mockAxiosInstance._responseInterceptor = { onFulfilled, onRejected };
          })
        }
      },
      _requestInterceptor: null as any,
      _responseInterceptor: null as any
    };

    // Mock axios.create to return our mock instance
    mockedAxios.create.mockReturnValue(mockAxiosInstance as any);

    client = new RenderClient(backendUrl, userPhone, secret, mockLogger);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create axios instance with correct config', () => {
      expect(mockedAxios.create).toHaveBeenCalledWith({
        baseURL: backendUrl,
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    });

    it('should set up request interceptor', () => {
      expect(mockAxiosInstance.interceptors.request.use).toHaveBeenCalled();
    });

    it('should set up response interceptor', () => {
      expect(mockAxiosInstance.interceptors.response.use).toHaveBeenCalled();
    });
  });

  describe('register', () => {
    it('should register edge agent successfully', async () => {
      const mockResponse = {
        data: {
          edge_agent_id: 'edge_123456'
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const edgeAgentId = await client.register();

      expect(edgeAgentId).toBe('edge_123456');
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/edge/register', {
        user_phone: userPhone,
        apple_id: null,
        version: '2.0.0',
        capabilities: ['transport', 'scheduler'],
        auth_token: 'edge_manual_token'
      });
      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Registering edge agent')
      )).toBe(true);
      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Registered as edge agent')
      )).toBe(true);
    });

    it('should use REGISTRATION_TOKEN from env if available', async () => {
      const originalToken = process.env.REGISTRATION_TOKEN;
      process.env.REGISTRATION_TOKEN = 'custom_token';

      mockAxiosInstance.post.mockResolvedValue({
        data: { edge_agent_id: 'edge_123' }
      });

      await client.register();

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/edge/register', expect.objectContaining({
        auth_token: 'custom_token'
      }));

      // Restore
      if (originalToken) {
        process.env.REGISTRATION_TOKEN = originalToken;
      } else {
        delete process.env.REGISTRATION_TOKEN;
      }
    });

    it('should throw error on registration failure', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      await expect(client.register()).rejects.toThrow('Failed to register edge agent');
      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('Registration failed')
      )).toBe(true);
    });

    it('should set edge agent ID in auth after registration', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { edge_agent_id: 'edge_123' }
      });

      await client.register();

      expect(client.getEdgeAgentId()).toBe('edge_123');
    });
  });

  describe('sendMessage', () => {
    beforeEach(async () => {
      // Register first
      mockAxiosInstance.post.mockResolvedValue({
        data: { edge_agent_id: 'edge_123' }
      });
      await client.register();
      mockAxiosInstance.post.mockClear();
    });

    it('should send message successfully', async () => {
      const request = {
        thread_id: 'iMessage;-;+15551234567',
        sender: '+15551234567',
        filtered_text: 'Hello',
        original_timestamp: new Date().toISOString(),
        filter_reason: '',
        is_group: false,
        participants: []
      };

      const mockResponse = {
        data: {
          should_respond: true,
          reply_text: 'Hi there!',
          reply_bubbles: ['Hi there!']
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const response = await client.sendMessage(request);

      expect(response.should_respond).toBe(true);
      expect(response.reply_text).toBe('Hi there!');
      expect(response.reply_bubbles).toEqual(['Hi there!']);
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/edge/message', request);
    });

    it('should return safe default on error', async () => {
      const request = {
        thread_id: 'iMessage;-;+15551234567',
        sender: '+15551234567',
        filtered_text: 'Hello',
        original_timestamp: new Date().toISOString(),
        filter_reason: '',
        is_group: false,
        participants: []
      };

      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      const response = await client.sendMessage(request);

      expect(response.should_respond).toBe(false);
      expect(response.reply_text).toBeUndefined();
      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('Failed to send message to backend')
      )).toBe(true);
    });

    it('should log debug information', async () => {
      const request = {
        thread_id: 'iMessage;-;+15551234567',
        sender: '+15551234567',
        filtered_text: 'Hello',
        original_timestamp: new Date().toISOString(),
        filter_reason: '',
        is_group: false,
        participants: []
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { should_respond: false }
      });

      await client.sendMessage(request);

      expect(mockLogger.debugMessages.some(msg =>
        msg.includes('Sending message to backend')
      )).toBe(true);
    });

    it('should handle multi-bubble responses', async () => {
      const request = {
        thread_id: 'iMessage;-;+15551234567',
        sender: '+15551234567',
        filtered_text: 'Hello',
        original_timestamp: new Date().toISOString(),
        filter_reason: '',
        is_group: false,
        participants: []
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: {
          should_respond: true,
          reply_bubbles: ['Hello!', 'How can I help?']
        }
      });

      const response = await client.sendMessage(request);

      expect(response.reply_bubbles).toEqual(['Hello!', 'How can I help?']);
    });
  });

  describe('sync', () => {
    beforeEach(async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { edge_agent_id: 'edge_123' }
      });
      await client.register();
      mockAxiosInstance.post.mockClear();
    });

    it('should sync successfully', async () => {
      const request = {
        edge_agent_id: 'edge_123',
        last_command_id: null,
        pending_events: [],
        status: {
          scheduled_messages: 0,
          active_rules: 0,
          uptime_seconds: 100
        }
      };

      const mockResponse = {
        data: {
          commands: [{
            command_id: 'cmd_1',
            command_type: 'schedule_message',
            payload: {}
          }],
          ack_events: ['event_1'],
          config_updates: { interval: 30 }
        }
      };

      mockAxiosInstance.post.mockResolvedValue(mockResponse);

      const response = await client.sync(request);

      expect(response.commands.length).toBe(1);
      expect(response.ack_events).toEqual(['event_1']);
      expect(response.config_updates).toEqual({ interval: 30 });
      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/edge/sync', request);
    });

    it('should return empty response on error', async () => {
      const request = {
        edge_agent_id: 'edge_123',
        last_command_id: null,
        pending_events: [],
        status: {
          scheduled_messages: 0,
          active_rules: 0,
          uptime_seconds: 100
        }
      };

      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      const response = await client.sync(request);

      expect(response.commands).toEqual([]);
      expect(response.ack_events).toEqual([]);
      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('Failed to sync with backend')
      )).toBe(true);
    });

    it('should handle missing optional fields', async () => {
      const request = {
        edge_agent_id: 'edge_123',
        last_command_id: null,
        pending_events: [],
        status: {
          scheduled_messages: 0,
          active_rules: 0,
          uptime_seconds: 100
        }
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: {} // Empty response
      });

      const response = await client.sync(request);

      expect(response.commands).toEqual([]);
      expect(response.ack_events).toEqual([]);
      expect(response.config_updates).toBeUndefined();
    });

    it('should log sync information', async () => {
      const request = {
        edge_agent_id: 'edge_123',
        last_command_id: null,
        pending_events: [{ event_id: 'evt_1', event_type: 'test', details: {} }],
        status: {
          scheduled_messages: 0,
          active_rules: 0,
          uptime_seconds: 100
        }
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { commands: [], ack_events: [] }
      });

      await client.sync(request);

      expect(mockLogger.debugMessages.some(msg =>
        msg.includes('Syncing with backend')
      )).toBe(true);
      // The debug message logs the object, not formatted string
      expect(mockLogger.debugMessages.length).toBeGreaterThan(0);
    });
  });

  describe('acknowledgeCommand', () => {
    beforeEach(async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { edge_agent_id: 'edge_123' }
      });
      await client.register();
      mockAxiosInstance.post.mockClear();
    });

    it('should acknowledge successful command', async () => {
      mockAxiosInstance.post.mockResolvedValue({});

      await client.acknowledgeCommand('cmd_123', true);

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/edge/command/ack', {
        command_id: 'cmd_123',
        success: true,
        error: null,
        timestamp: expect.any(String)
      });
      expect(mockLogger.debugMessages.some(msg =>
        msg.includes('Command acknowledged')
      )).toBe(true);
    });

    it('should acknowledge failed command with error', async () => {
      mockAxiosInstance.post.mockResolvedValue({});

      await client.acknowledgeCommand('cmd_456', false, 'Execution failed');

      expect(mockAxiosInstance.post).toHaveBeenCalledWith('/edge/command/ack', {
        command_id: 'cmd_456',
        success: false,
        error: 'Execution failed',
        timestamp: expect.any(String)
      });
    });

    it('should not throw on acknowledgment failure', async () => {
      mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

      await expect(
        client.acknowledgeCommand('cmd_789', true)
      ).resolves.toBeUndefined();

      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('Failed to acknowledge command')
      )).toBe(true);
    });
  });

  describe('healthCheck', () => {
    it('should return true when backend is healthy', async () => {
      mockAxiosInstance.get.mockResolvedValue({ status: 200 });

      const result = await client.healthCheck();

      expect(result).toBe(true);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
    });

    it('should return false when backend is unhealthy', async () => {
      mockAxiosInstance.get.mockRejectedValue(new Error('Connection refused'));

      const result = await client.healthCheck();

      expect(result).toBe(false);
      expect(mockLogger.warnMessages.some(msg =>
        msg.includes('Backend health check failed')
      )).toBe(true);
    });
  });

  describe('getEdgeAgentId', () => {
    it('should return null before registration', () => {
      expect(client.getEdgeAgentId()).toBeNull();
    });

    it('should return edge agent ID after registration', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { edge_agent_id: 'edge_999' }
      });

      await client.register();

      expect(client.getEdgeAgentId()).toBe('edge_999');
    });
  });

  describe('request interceptor', () => {
    it('should add auth headers when token is valid', async () => {
      // Register to get token
      mockAxiosInstance.post.mockResolvedValue({
        data: { edge_agent_id: 'edge_123' }
      });
      await client.register();

      // Get the request interceptor
      const interceptor = mockAxiosInstance._requestInterceptor.onFulfilled;

      // Mock config
      const config = {
        headers: {
          set: jest.fn()
        }
      };

      // Execute interceptor
      const result = interceptor(config);

      // Should have added auth headers
      expect(config.headers.set).toHaveBeenCalledWith('Authorization', expect.any(String));
      expect(config.headers.set).toHaveBeenCalledWith('X-Edge-Protocol-Version', '1.0');
      expect(result).toBe(config);
    });

    it('should not add auth headers when token is invalid', () => {
      const interceptor = mockAxiosInstance._requestInterceptor.onFulfilled;

      const config = {
        headers: {
          set: jest.fn()
        }
      };

      interceptor(config);

      // Should not have added auth headers (no token yet)
      expect(config.headers.set).not.toHaveBeenCalledWith('Authorization', expect.any(String));
    });
  });

  describe('response interceptor', () => {
    it('should pass through successful responses', () => {
      const interceptor = mockAxiosInstance._responseInterceptor.onFulfilled;
      const response = { data: { success: true } };

      const result = interceptor(response);

      expect(result).toBe(response);
    });

    it('should log error details on failure', async () => {
      const interceptor = mockAxiosInstance._responseInterceptor.onRejected;
      const error = {
        message: 'Request failed',
        response: {
          status: 422,
          data: { error: 'Invalid request' }
        }
      };

      await expect(interceptor(error)).rejects.toEqual(error);

      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('Backend request failed')
      )).toBe(true);
      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('Response status: 422')
      )).toBe(true);
    });

    it('should handle errors without response', async () => {
      const interceptor = mockAxiosInstance._responseInterceptor.onRejected;
      const error = {
        message: 'Network error'
      };

      await expect(interceptor(error)).rejects.toEqual(error);

      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('Backend request failed')
      )).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should handle empty reply_bubbles', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { edge_agent_id: 'edge_123' }
      });
      await client.register();
      mockAxiosInstance.post.mockClear();

      const request = {
        thread_id: 'test',
        sender: '+15551234567',
        filtered_text: 'Hello',
        original_timestamp: new Date().toISOString(),
        filter_reason: '',
        is_group: false,
        participants: []
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { should_respond: false }
      });

      const response = await client.sendMessage(request);

      expect(response.should_respond).toBe(false);
      expect(response.reply_bubbles).toBeUndefined();
    });

    it('should handle very long filtered_text in logs', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { edge_agent_id: 'edge_123' }
      });
      await client.register();
      mockAxiosInstance.post.mockClear();

      const longText = 'A'.repeat(200);
      const request = {
        thread_id: 'test',
        sender: '+15551234567',
        filtered_text: longText,
        original_timestamp: new Date().toISOString(),
        filter_reason: '',
        is_group: false,
        participants: []
      };

      mockAxiosInstance.post.mockResolvedValue({
        data: { should_respond: false }
      });

      await client.sendMessage(request);

      // Should log debug messages
      expect(mockLogger.debugMessages.some(msg =>
        msg.includes('Sending message to backend')
      )).toBe(true);
    });
  });
});
