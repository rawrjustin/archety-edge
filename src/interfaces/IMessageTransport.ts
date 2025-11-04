/**
 * IMessageTransport - Abstract interface for iMessage transport
 * This allows us to swap between AppleScript, Swift, or other implementations
 */

export interface IncomingMessage {
  threadId: string;        // Chat GUID from Messages DB
  sender: string;          // Phone number or Apple ID
  text: string;            // Message content
  timestamp: Date;         // When message was sent
  isGroup: boolean;        // 1:1 vs group chat
  participants: string[];  // All participants in the chat
}

export interface IMessageTransport {
  /**
   * Start monitoring for new messages
   */
  start(): Promise<void>;

  /**
   * Stop monitoring
   */
  stop(): void;

  /**
   * Poll for new messages since last check
   */
  pollNewMessages(): Promise<IncomingMessage[]>;

  /**
   * Send a message to a thread
   */
  sendMessage(threadId: string, text: string, isGroup: boolean): Promise<boolean>;

  /**
   * Send multiple message bubbles with natural timing
   */
  sendMultiBubble(threadId: string, bubbles: string[], isGroup: boolean): Promise<boolean>;

  /**
   * Get transport name for logging
   */
  getName(): string;
}
