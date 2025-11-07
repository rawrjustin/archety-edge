/**
 * IBackendClient - Abstract interface for backend communication
 * Allows for easy mocking and testing
 */

import { SyncRequest, SyncResponse } from './ICommands';

export interface BackendMessageRequest {
  thread_id: string;
  sender: string;
  filtered_text: string;
  original_timestamp: string;
  is_group: boolean;
  participants: string[];
  was_redacted?: boolean;
  redacted_fields?: string[];
  filter_reason: string;
}

export interface BackendMessageResponse {
  should_respond: boolean;
  reply_text?: string;
  reply_bubbles?: string[];  // Multi-bubble support

  // NEW: Fast reflex support
  reflex_message?: string;  // Immediate response (sent first, ~100ms target)
  burst_messages?: string[];  // Follow-up messages (sent after delay)
  burst_delay_ms?: number;  // Delay before burst (default: 2000ms)
}

export interface IBackendClient {
  /**
   * Register this edge agent with the backend
   */
  register(): Promise<string>;  // Returns edge_agent_id

  /**
   * Send a message to the backend for processing
   */
  sendMessage(request: BackendMessageRequest): Promise<BackendMessageResponse>;

  /**
   * Sync with backend - send events and receive commands
   */
  sync(request: SyncRequest): Promise<SyncResponse>;

  /**
   * Acknowledge command execution
   */
  acknowledgeCommand(commandId: string, success: boolean, error?: string): Promise<void>;

  /**
   * Health check
   */
  healthCheck(): Promise<boolean>;

  /**
   * Get current edge agent ID
   */
  getEdgeAgentId(): string | null;
}
