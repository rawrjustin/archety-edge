import { z } from 'zod';

/**
 * Zod schema for runtime configuration validation
 * Ensures config.yaml and environment variables are valid
 */
export const ConfigSchema = z.object({
  edge: z.object({
    agent_id: z.string().min(1, 'agent_id is required'),
    user_phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number format (E.164)'),
    persona_id: z.string().min(1).regex(/^[a-z][a-z0-9_]*$/, 'persona_id must be lowercase alphanumeric').default('luna'),
  }),

  backend: z.object({
    url: z.string()
      .url('Invalid backend URL')
      .refine((url) => url.startsWith('https://'), 'Backend URL must use HTTPS'),
    websocket_url: z.string().optional(),
    sync_interval_seconds: z.number().min(1).max(300),
    request_timeout_ms: z.number().min(1000).max(120000).optional(),
    max_concurrent_requests: z.number().min(1).max(10).optional()
  }),

  websocket: z.object({
    enabled: z.boolean().optional(),
    reconnect_attempts: z.number().optional(), // DEPRECATED: Kept for backward compatibility
    ping_interval_seconds: z.number().min(5).max(300).optional()
  }).optional(),

  imessage: z.object({
    poll_interval_seconds: z.number().min(0.1).max(60),
    db_path: z.string().min(1),
    attachments_path: z.string().optional(),
    transport_mode: z.enum(['applescript', 'native_helper']).optional(),
    bridge_executable: z.string().optional(),
    bridge_args: z.array(z.string()).optional(),
    enable_fast_check: z.boolean().optional(),
    max_messages_per_poll: z.number().min(1).max(1000).optional(),
    max_message_age_seconds: z.number().min(60).max(86400).optional(),
    typing_socket_path: z.string().optional()
  }),

  database: z.object({
    path: z.string().min(1),
    state_path: z.string().optional(),
    rules_path: z.string().optional(),
    plans_path: z.string().optional()
  }),

  scheduler: z.object({
    check_interval_seconds: z.number().min(1).max(300).optional(),
    adaptive_mode: z.boolean().optional()
  }).optional(),

  performance: z.object({
    profile: z.enum(['balanced', 'low-latency', 'low-resource']).optional(),
    parallel_message_processing: z.boolean().optional(),
    batch_applescript_sends: z.boolean().optional()
  }).optional(),

  security: z.object({
    keychain_service: z.string().optional(),
    keychain_account: z.string().optional()
  }).optional(),

  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    file: z.string().min(1)
  }),

  dev: z.object({
    enabled: z.boolean().default(false),
  }).optional(),

  monitoring: z.object({
    sentry: z.object({
      enabled: z.boolean(),
      dsn: z.string().optional(),
      environment: z.string().optional(),
      traces_sample_rate: z.number().min(0).max(1).optional(),
      profiles_sample_rate: z.number().min(0).max(1).optional()
    }).optional(),
    posthog: z.object({
      enabled: z.boolean(),
      api_key: z.string().optional(),
      host: z.string().url().optional(),
      flush_interval_ms: z.number().min(1000).max(60000).optional(),
      feature_flags_enabled: z.boolean().optional()
    }).optional(),
    health_check: z.object({
      enabled: z.boolean().optional(),
      port: z.number().min(1024).max(65535).optional()
    }).optional()
  }).optional()
});

/**
 * TypeScript type inferred from Zod schema
 * This ensures type safety across the application
 */
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Validate a config object at runtime
 * Throws ZodError if validation fails
 */
export function validateConfig(config: unknown): Config {
  return ConfigSchema.parse(config);
}

/**
 * Safely validate config with detailed error messages
 */
export function validateConfigSafe(config: unknown): {
  success: boolean;
  data?: Config;
  errors?: string[];
} {
  const result = ConfigSchema.safeParse(config);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map(
    (err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`
  );

  return { success: false, errors };
}
