import * as crypto from 'crypto';

/**
 * EdgeAuth - HMAC-based authentication for edge agent
 */
export class EdgeAuth {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private edgeAgentId: string | null = null;

  constructor(
    private userPhone: string,
    private secret: string
  ) {}

  /**
   * Set edge agent ID after registration
   */
  setEdgeAgentId(id: string): void {
    this.edgeAgentId = id;
    this.refreshToken();
  }

  /**
   * Generate new HMAC authentication token
   * Token format: base64(edge_agent_id:user_phone:timestamp:hmac_signature)
   */
  private refreshToken(): void {
    if (!this.edgeAgentId) {
      throw new Error('Edge agent ID not set. Call setEdgeAgentId() first.');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const tokenData = `${this.edgeAgentId}:${this.userPhone}:${timestamp}`;

    // Create HMAC signature
    const signature = crypto
      .createHmac('sha256', this.secret)
      .update(tokenData)
      .digest('hex');

    const fullToken = `${tokenData}:${signature}`;
    this.token = Buffer.from(fullToken).toString('base64');

    // Token expires in 24 hours
    this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }

  /**
   * Get current authentication token
   * Automatically refreshes if expired
   */
  getToken(): string {
    if (!this.token || !this.tokenExpiry) {
      throw new Error('No token available. Register first.');
    }

    // Refresh if token will expire in next hour
    const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
    if (this.tokenExpiry < oneHourFromNow) {
      this.refreshToken();
    }

    return this.token;
  }

  /**
   * Get authentication headers for HTTP requests
   */
  getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.getToken()}`,
      'Content-Type': 'application/json',
      'X-Edge-Protocol-Version': '1.0',
      'X-Edge-Timestamp': Math.floor(Date.now() / 1000).toString()
    };
  }

  /**
   * Check if we have a valid token
   */
  hasValidToken(): boolean {
    return (
      this.token !== null &&
      this.tokenExpiry !== null &&
      this.tokenExpiry > new Date()
    );
  }

  /**
   * Get edge agent ID
   */
  getEdgeAgentId(): string | null {
    return this.edgeAgentId;
  }
}
