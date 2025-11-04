import { IMessageTransport, IncomingMessage } from '../../src/interfaces/IMessageTransport';

/**
 * Mock transport for testing
 * Simulates message sending without actually using iMessage
 */
export class MockTransport implements IMessageTransport {
  public sentMessages: Array<{ threadId: string; text: string; isGroup: boolean }> = [];
  public sentMultiBubbles: Array<{ threadId: string; bubbles: string[]; isGroup: boolean }> = [];
  public shouldFail: boolean = false;

  async start(): Promise<void> {
    // No-op for mock
  }

  stop(): void {
    // No-op for mock
  }

  async pollNewMessages(): Promise<IncomingMessage[]> {
    // Return empty array for mock
    return [];
  }

  async sendMessage(threadId: string, text: string, isGroup: boolean): Promise<boolean> {
    if (this.shouldFail) {
      return false;
    }

    this.sentMessages.push({ threadId, text, isGroup });
    return true;
  }

  async sendMultiBubble(threadId: string, bubbles: string[], isGroup: boolean): Promise<boolean> {
    if (this.shouldFail) {
      return false;
    }

    this.sentMultiBubbles.push({ threadId, bubbles, isGroup });
    return true;
  }

  getName(): string {
    return 'MockTransport';
  }

  /**
   * Clear sent messages
   */
  clear(): void {
    this.sentMessages = [];
    this.sentMultiBubbles = [];
    this.shouldFail = false;
  }

  /**
   * Get last sent message
   */
  getLastMessage(): { threadId: string; text: string; isGroup: boolean } | undefined {
    return this.sentMessages[this.sentMessages.length - 1];
  }
}
