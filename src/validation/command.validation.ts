import { z } from 'zod';

/**
 * Command validation schemas
 * Validates all backend commands before execution
 * Prevents injection attacks and malformed data
 */

// Thread ID validation - only allow safe characters
const ThreadIdSchema = z.string()
  .min(1, 'Thread ID required')
  .max(200, 'Thread ID too long')
  .regex(/^[a-zA-Z0-9+@._\-;]+$/, 'Invalid thread ID format - contains forbidden characters');

// Message text validation with length limits
const MessageTextSchema = z.string()
  .min(1, 'Message text required')
  .max(5000, 'Message exceeds 5000 character limit')
  .refine(
    (text) => !containsAppleScriptInjection(text),
    'Message contains forbidden AppleScript commands'
  );

/**
 * Detect potential AppleScript injection attempts
 * Checks for dangerous patterns that could execute arbitrary code
 */
function containsAppleScriptInjection(text: string): boolean {
  const dangerousPatterns = [
    /do shell script/i,
    /tell application "system events"/i,
    /tell application "finder"/i,
    /activate application/i,
    /\bexecute\b.*\bscript\b/i,
    /osascript/i,
    /applescript/i
  ];

  return dangerousPatterns.some(pattern => pattern.test(text));
}

// UUID validation for IDs
const UUIDSchema = z.string().uuid('Invalid UUID format');

// ISO8601 timestamp validation
const ISO8601Schema = z.string()
  .datetime('Invalid ISO8601 timestamp')
  .refine((date) => {
    const sendTime = new Date(date);
    const now = new Date();
    const maxFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
    return sendTime >= now && sendTime <= maxFuture;
  }, 'Timestamp must be between now and 1 year in future');

/**
 * send_message_now command payload validation
 */
export const SendMessageNowPayloadSchema = z.object({
  thread_id: ThreadIdSchema,
  text: MessageTextSchema,
  bubble_type: z.enum(['reflex', 'burst', 'normal']).optional()
});

export type SendMessageNowPayload = z.infer<typeof SendMessageNowPayloadSchema>;

/**
 * schedule_message command payload validation
 */
export const ScheduleMessagePayloadSchema = z.object({
  thread_id: ThreadIdSchema,
  message_text: MessageTextSchema,
  send_at: ISO8601Schema,
  is_group: z.boolean().optional()
});

export type ScheduleMessagePayload = z.infer<typeof ScheduleMessagePayloadSchema>;

/**
 * cancel_scheduled command payload validation
 */
export const CancelScheduledPayloadSchema = z.object({
  schedule_id: UUIDSchema
});

export type CancelScheduledPayload = z.infer<typeof CancelScheduledPayloadSchema>;

/**
 * set_rule command payload validation
 */
export const SetRulePayloadSchema = z.object({
  rule_type: z.enum(['auto_reply', 'forward', 'filter', 'schedule_reply']),
  rule_config: z.object({
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    conditions: z.array(z.any()).min(1, 'At least one condition required'),
    action: z.object({
      type: z.string().min(1),
      params: z.record(z.string(), z.any()).optional()
    })
  })
});

export type SetRulePayload = z.infer<typeof SetRulePayloadSchema>;

/**
 * update_plan command payload validation
 */
export const UpdatePlanPayloadSchema = z.object({
  thread_id: ThreadIdSchema,
  plan_data: z.record(z.string(), z.any())
});

export type UpdatePlanPayload = z.infer<typeof UpdatePlanPayloadSchema>;

/**
 * Command wrapper schema
 * Validates the outer command structure
 */
export const EdgeCommandSchema = z.object({
  command_id: UUIDSchema,
  command_type: z.enum([
    'send_message_now',
    'schedule_message',
    'cancel_scheduled',
    'set_rule',
    'update_plan'
  ]),
  payload: z.any(), // Will be validated based on command_type
  timestamp: z.string().datetime().optional(),
  priority: z.enum(['normal', 'immediate']).optional()
});

export type ValidatedCommand = z.infer<typeof EdgeCommandSchema>;

/**
 * Validate command and payload together
 * Returns validated command with strongly-typed payload
 */
export function validateCommand(command: unknown): {
  command: ValidatedCommand;
  payload: SendMessageNowPayload | ScheduleMessagePayload | CancelScheduledPayload | SetRulePayload | UpdatePlanPayload;
} {
  // First validate command wrapper
  const validatedCommand = EdgeCommandSchema.parse(command) as ValidatedCommand;

  // Then validate payload based on command type
  let validatedPayload: SendMessageNowPayload | ScheduleMessagePayload | CancelScheduledPayload | SetRulePayload | UpdatePlanPayload;

  switch (validatedCommand.command_type) {
    case 'send_message_now':
      validatedPayload = SendMessageNowPayloadSchema.parse(validatedCommand.payload);
      break;

    case 'schedule_message':
      validatedPayload = ScheduleMessagePayloadSchema.parse(validatedCommand.payload);
      break;

    case 'cancel_scheduled':
      validatedPayload = CancelScheduledPayloadSchema.parse(validatedCommand.payload);
      break;

    case 'set_rule':
      validatedPayload = SetRulePayloadSchema.parse(validatedCommand.payload);
      break;

    case 'update_plan':
      validatedPayload = UpdatePlanPayloadSchema.parse(validatedCommand.payload);
      break;

    default: {
      const _exhaustive: never = validatedCommand.command_type;
      throw new Error(`Unknown command type: ${_exhaustive}`);
    }
  }

  return {
    command: validatedCommand,
    payload: validatedPayload
  };
}

/**
 * Safe validation with detailed error messages
 */
export function validateCommandSafe(command: unknown): {
  success: boolean;
  data?: { command: ValidatedCommand; payload: SendMessageNowPayload | ScheduleMessagePayload | CancelScheduledPayload | SetRulePayload | UpdatePlanPayload };
  errors?: string[];
} {
  try {
    const result = validateCommand(command);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map(
        (err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`
      );
      return { success: false, errors };
    }

    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown validation error']
    };
  }
}
