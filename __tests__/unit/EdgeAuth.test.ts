import { EdgeAuth } from '../../src/backend/auth';
import * as crypto from 'crypto';

describe('EdgeAuth', () => {
  let auth: EdgeAuth;
  const userPhone = '+15551234567';
  const secret = 'test-secret-key';
  const edgeAgentId = 'edge_123456';

  beforeEach(() => {
    auth = new EdgeAuth(userPhone, secret);
  });

  describe('initialization', () => {
    it('should create auth instance without token', () => {
      expect(auth.hasValidToken()).toBe(false);
      expect(auth.getEdgeAgentId()).toBeNull();
    });
  });

  describe('setEdgeAgentId', () => {
    it('should set edge agent ID and generate token', () => {
      auth.setEdgeAgentId(edgeAgentId);

      expect(auth.getEdgeAgentId()).toBe(edgeAgentId);
      expect(auth.hasValidToken()).toBe(true);
    });

    it('should generate different tokens for different agent IDs', () => {
      auth.setEdgeAgentId('edge_111');
      const token1 = auth.getToken();

      const auth2 = new EdgeAuth(userPhone, secret);
      auth2.setEdgeAgentId('edge_222');
      const token2 = auth2.getToken();

      expect(token1).not.toBe(token2);
    });

    it('should allow updating agent ID', () => {
      auth.setEdgeAgentId('edge_111');
      const token1 = auth.getToken();

      auth.setEdgeAgentId('edge_222');
      const token2 = auth.getToken();

      expect(token1).not.toBe(token2);
      expect(auth.getEdgeAgentId()).toBe('edge_222');
    });
  });

  describe('getToken', () => {
    it('should throw error if agent ID not set', () => {
      expect(() => auth.getToken()).toThrow('No token available');
    });

    it('should return base64 encoded token', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const token = auth.getToken();

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);

      // Should be valid base64
      expect(() => Buffer.from(token, 'base64')).not.toThrow();
    });

    it('should include edge agent ID in token', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const token = auth.getToken();

      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      expect(decoded).toContain(edgeAgentId);
    });

    it('should include user phone in token', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const token = auth.getToken();

      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      expect(decoded).toContain(userPhone);
    });

    it('should include timestamp in token', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const token = auth.getToken();

      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const parts = decoded.split(':');

      // Format: edge_agent_id:user_phone:timestamp:signature
      expect(parts.length).toBe(4);

      const timestamp = parseInt(parts[2], 10);
      expect(timestamp).toBeGreaterThan(0);
      expect(timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    });

    it('should include HMAC signature in token', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const token = auth.getToken();

      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const parts = decoded.split(':');

      expect(parts.length).toBe(4);
      const signature = parts[3];

      // SHA256 hex signature should be 64 characters
      expect(signature.length).toBe(64);
      expect(/^[a-f0-9]{64}$/i.test(signature)).toBe(true);
    });

    it('should generate valid HMAC signature', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const token = auth.getToken();

      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const parts = decoded.split(':');

      const [agentId, phone, timestamp, signature] = parts;
      const tokenData = `${agentId}:${phone}:${timestamp}`;

      // Recompute signature
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(tokenData)
        .digest('hex');

      expect(signature).toBe(expectedSignature);
    });

    it('should return same token if not expired', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const token1 = auth.getToken();
      const token2 = auth.getToken();

      expect(token1).toBe(token2);
    });
  });

  describe('hasValidToken', () => {
    it('should return false initially', () => {
      expect(auth.hasValidToken()).toBe(false);
    });

    it('should return true after setting agent ID', () => {
      auth.setEdgeAgentId(edgeAgentId);
      expect(auth.hasValidToken()).toBe(true);
    });

    it('should return true for fresh token', () => {
      auth.setEdgeAgentId(edgeAgentId);
      expect(auth.hasValidToken()).toBe(true);
    });
  });

  describe('getAuthHeaders', () => {
    it('should throw error if agent ID not set', () => {
      expect(() => auth.getAuthHeaders()).toThrow();
    });

    it('should return authorization header', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const headers = auth.getAuthHeaders();

      expect(headers.Authorization).toBeDefined();
      expect(headers.Authorization).toMatch(/^Bearer .+$/);
    });

    it('should include content type header', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const headers = auth.getAuthHeaders();

      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should include protocol version header', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const headers = auth.getAuthHeaders();

      expect(headers['X-Edge-Protocol-Version']).toBe('1.0');
    });

    it('should include timestamp header', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const headers = auth.getAuthHeaders();

      expect(headers['X-Edge-Timestamp']).toBeDefined();
      const timestamp = parseInt(headers['X-Edge-Timestamp'], 10);
      expect(timestamp).toBeGreaterThan(0);
      expect(timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 1);
    });

    it('should return headers with correct token', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const headers = auth.getAuthHeaders();
      const token = auth.getToken();

      expect(headers.Authorization).toBe(`Bearer ${token}`);
    });
  });

  describe('getEdgeAgentId', () => {
    it('should return null initially', () => {
      expect(auth.getEdgeAgentId()).toBeNull();
    });

    it('should return agent ID after setting', () => {
      auth.setEdgeAgentId(edgeAgentId);
      expect(auth.getEdgeAgentId()).toBe(edgeAgentId);
    });
  });

  describe('token security', () => {
    it('should generate different tokens with different secrets', () => {
      const auth1 = new EdgeAuth(userPhone, 'secret1');
      auth1.setEdgeAgentId(edgeAgentId);
      const token1 = auth1.getToken();

      const auth2 = new EdgeAuth(userPhone, 'secret2');
      auth2.setEdgeAgentId(edgeAgentId);
      const token2 = auth2.getToken();

      expect(token1).not.toBe(token2);
    });

    it('should generate different tokens for different phones', () => {
      const auth1 = new EdgeAuth('+15551111111', secret);
      auth1.setEdgeAgentId(edgeAgentId);
      const token1 = auth1.getToken();

      const auth2 = new EdgeAuth('+15552222222', secret);
      auth2.setEdgeAgentId(edgeAgentId);
      const token2 = auth2.getToken();

      expect(token1).not.toBe(token2);
    });

    it('should not expose secret in token', () => {
      auth.setEdgeAgentId(edgeAgentId);
      const token = auth.getToken();

      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      expect(decoded).not.toContain(secret);
    });

    it('should generate different tokens at different times', async () => {
      auth.setEdgeAgentId(edgeAgentId);
      const token1 = auth.getToken();

      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Force refresh by setting agent ID again
      auth.setEdgeAgentId(edgeAgentId);
      const token2 = auth.getToken();

      // Tokens should be different due to different timestamps
      expect(token1).not.toBe(token2);
    });
  });

  describe('edge cases', () => {
    it('should handle empty phone number', () => {
      const authEmpty = new EdgeAuth('', secret);
      authEmpty.setEdgeAgentId(edgeAgentId);

      expect(authEmpty.hasValidToken()).toBe(true);
      const token = authEmpty.getToken();
      expect(token).toBeDefined();
    });

    it('should handle special characters in agent ID', () => {
      const specialId = 'edge_123-456_test';
      auth.setEdgeAgentId(specialId);

      expect(auth.getEdgeAgentId()).toBe(specialId);
      const token = auth.getToken();
      expect(token).toBeDefined();
    });

    it('should handle very long agent IDs', () => {
      const longId = 'edge_' + 'x'.repeat(100);
      auth.setEdgeAgentId(longId);

      expect(auth.getEdgeAgentId()).toBe(longId);
      const token = auth.getToken();
      expect(token).toBeDefined();
    });

    it('should handle unicode in phone number', () => {
      const authUnicode = new EdgeAuth('+1 (555) 123-4567', secret);
      authUnicode.setEdgeAgentId(edgeAgentId);

      expect(authUnicode.hasValidToken()).toBe(true);
      const token = authUnicode.getToken();
      expect(token).toBeDefined();
    });
  });
});
