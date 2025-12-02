/**
 * IBackendClient - Abstract interface for backend communication
 * Allows for easy mocking and testing
 */

import { SyncRequest, SyncResponse } from './ICommands';

export interface BackendMessageRequest {
  chat_guid: string;           // Unique conversation ID (e.g., "iMessage;-;+15551234567")
  mode: 'direct' | 'group';    // Conversation mode
  sender: string;              // Phone number or Apple ID
  text: string;                // Message text
  timestamp: number;           // Unix timestamp
  participants: string[];      // All participants in conversation
  metadata?: {                 // Optional metadata
    is_first_message?: boolean;
    mentioned_sage?: boolean;
    was_redacted?: boolean;
    redacted_fields?: string[];
    filter_reason?: string;
    [key: string]: any;
  };
  context?: BackendMiniAppContext;
  attachments?: BackendAttachmentSummary[];
}

export interface BackendMessageResponse {
  should_respond: boolean;
  reply_text?: string;
  reply_bubbles?: string[];  // Multi-bubble support

  // NEW: Fast reflex support
  reflex_message?: string;  // Immediate response (sent first, ~100ms target)
  burst_messages?: string[];  // Follow-up messages (sent after delay)
  burst_delay_ms?: number;  // Delay before burst (default: 2000ms)
  mini_app_triggered?: string | null;
  room_id?: string | null;
  commands?: any[];
  responses?: Array<{
    text: string;
    recipient?: string | null;
    chat_guid?: string;
    is_reflex?: boolean;
  }>;
  context_metadata?: Record<string, any>;
}

export interface BackendMiniAppContext {
  active_miniapp?: string;
  room_id?: string;
  state?: 'active' | 'completed';
  metadata?: Record<string, any>;
}

export interface BackendAttachmentSummary {
  guid: string;
  mime_type?: string;
  size_bytes?: number | null;
  is_photo?: boolean;
  uploaded_photo_id?: string;
  skipped?: boolean;
  skip_reason?: string;
}

export interface PhotoUploadRequest {
  photo_data: string;
  user_phone: string;
  edge_agent_id: string;
  chat_guid: string;
  mime_type?: string;
  size_bytes?: number;
  attachment_guid?: string;
  context?: BackendMiniAppContext;
}

export interface PhotoUploadResponse {
  photo_id: string;
  photo_url: string;
  analysis?: Record<string, any>;
  action?: string | null;
  event?: Record<string, any>;
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
   * Upload a photo attachment to the backend
   */
  uploadPhoto(request: PhotoUploadRequest): Promise<PhotoUploadResponse>;

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
