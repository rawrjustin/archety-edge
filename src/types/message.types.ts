import { z } from 'zod';

/**
 * Zod schema for incoming messages from iMessage
 */
const AttachmentMetadataSchema = z.object({
  id: z.number(),
  guid: z.string(),
  filename: z.string().optional(),
  uti: z.string().optional(),
  mimeType: z.string().optional(),
  transferName: z.string().optional(),
  totalBytes: z.number().optional(),
  createdAt: z.date().optional(),
  relativePath: z.string().optional(),
  absolutePath: z.string().optional(),
  isSticker: z.boolean().optional(),
  isOutgoing: z.boolean().optional()
});

export const IncomingMessageSchema = z.object({
  threadId: z.string().min(1, 'threadId is required'),
  sender: z.string().min(1, 'sender is required'),
  text: z.string(),
  timestamp: z.date(),
  isGroup: z.boolean(),
  participants: z.array(z.string()),
  attachments: z.array(AttachmentMetadataSchema).optional()
});

/**
 * TypeScript type for incoming messages
 */
export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;

/**
 * Zod schema for backend message request
 */
export const BackendMessageRequestSchema = z.object({
  thread_id: z.string().min(1),
  sender: z.string().min(1),
  filtered_text: z.string(),
  original_timestamp: z.string(),
  is_group: z.boolean(),
  participants: z.array(z.string()),
  was_redacted: z.boolean(),
  redacted_fields: z.array(z.string()),
  filter_reason: z.string(),
  context: z.object({
    active_miniapp: z.string().optional(),
    room_id: z.string().optional(),
    state: z.enum(['active', 'completed']).optional(),
    metadata: z.record(z.string(), z.any()).optional()
  }).optional(),
  attachments: z.array(z.object({
    guid: z.string(),
    mime_type: z.string().optional(),
    size_bytes: z.number().nullable().optional(),
    is_photo: z.boolean().optional(),
    uploaded_photo_id: z.string().optional(),
    skipped: z.boolean().optional(),
    skip_reason: z.string().optional()
  })).optional()
});

export type BackendMessageRequest = z.infer<typeof BackendMessageRequestSchema>;

/**
 * Zod schema for backend message response
 */
export const BackendMessageResponseSchema = z.object({
  should_respond: z.boolean(),
  reply_text: z.string().optional(),
  reply_bubbles: z.array(z.string()).optional(),
  reflex_message: z.string().optional(),
  burst_messages: z.array(z.string()).optional(),
  burst_delay_ms: z.number().optional(),
  mini_app_triggered: z.string().nullable().optional(),
  room_id: z.string().nullable().optional(),
  commands: z.array(z.any()).optional(),
  responses: z.array(z.object({
    text: z.string(),
    recipient: z.string().nullable().optional(),
    chat_guid: z.string().optional(),
    is_reflex: z.boolean().optional()
  })).optional(),
  context_metadata: z.record(z.string(), z.any()).optional()
});

export type BackendMessageResponse = z.infer<typeof BackendMessageResponseSchema>;

/**
 * Validate incoming message at runtime
 */
export function validateIncomingMessage(message: unknown): IncomingMessage {
  return IncomingMessageSchema.parse(message);
}

/**
 * Validate backend response at runtime
 */
export function validateBackendResponse(response: unknown): BackendMessageResponse {
  return BackendMessageResponseSchema.parse(response);
}

/**
 * Safe validation with error details
 */
export function validateIncomingMessageSafe(message: unknown): {
  success: boolean;
  data?: IncomingMessage;
  errors?: string[];
} {
  const result = IncomingMessageSchema.safeParse(message);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map(
    (err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`
  );

  return { success: false, errors };
}
