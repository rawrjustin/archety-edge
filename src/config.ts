import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Config, ConfigSchema, validateConfigSafe } from './types/config.types';
import { z } from 'zod';

// Load environment variables
dotenv.config();

/**
 * Performance profile presets
 */
const PERFORMANCE_PROFILES = {
  'balanced': {
    backend: {
      sync_interval_seconds: 60,
      request_timeout_ms: 10000,
      max_concurrent_requests: 3
    },
    imessage: {
      poll_interval_seconds: 1,  // Quick Win: 1s polling for fast detection
      enable_fast_check: true,
      max_messages_per_poll: 100
    },
    scheduler: {
      check_interval_seconds: 30
    }
  },
  'low-latency': {
    backend: {
      sync_interval_seconds: 30,
      request_timeout_ms: 8000,
      max_concurrent_requests: 5
    },
    imessage: {
      poll_interval_seconds: 0.5,  // Ultra-responsive
      enable_fast_check: true,
      max_messages_per_poll: 100
    },
    scheduler: {
      check_interval_seconds: 10
    }
  },
  'low-resource': {
    backend: {
      sync_interval_seconds: 120,
      request_timeout_ms: 15000,
      max_concurrent_requests: 2
    },
    imessage: {
      poll_interval_seconds: 3,  // Lower CPU usage
      enable_fast_check: true,
      max_messages_per_poll: 50
    },
    scheduler: {
      check_interval_seconds: 60
    }
  }
};

// Config type is now imported from ./types/config.types.ts
// This ensures type safety and runtime validation with Zod

/**
 * Load configuration from config.yaml and environment variables
 * Environment variables take precedence over config file
 * ENHANCED: Supports performance profiles and optimized defaults
 * NOW WITH RUNTIME VALIDATION: Uses Zod to validate config at startup
 */
export function loadConfig(configPath: string = './config.yaml'): Config {
  // Load YAML config
  const configFile = fs.readFileSync(configPath, 'utf8');
  const rawConfig = yaml.load(configFile);

  // Validate and parse config with Zod
  let config: Config;
  try {
    config = ConfigSchema.parse(rawConfig);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Configuration validation failed:');
      error.issues.forEach((err: z.ZodIssue) => {
        console.error(`   ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('Invalid configuration. Please check config.yaml and fix the errors above.');
    }
    throw error;
  }

  // Apply performance profile if specified
  const profile = config.performance?.profile || 'balanced';
  const profileDefaults = PERFORMANCE_PROFILES[profile];

  // Apply defaults from profile
  config.backend.request_timeout_ms = config.backend.request_timeout_ms ?? profileDefaults.backend.request_timeout_ms;
  config.backend.max_concurrent_requests = config.backend.max_concurrent_requests ?? profileDefaults.backend.max_concurrent_requests;
  config.imessage.enable_fast_check = config.imessage.enable_fast_check ?? profileDefaults.imessage.enable_fast_check;
  config.imessage.max_messages_per_poll = config.imessage.max_messages_per_poll ?? profileDefaults.imessage.max_messages_per_poll;
  config.imessage.attachments_path = config.imessage.attachments_path
    ?? path.join(process.env.HOME || '', 'Library', 'Messages', 'Attachments');
  config.imessage.transport_mode = config.imessage.transport_mode ?? 'native_helper';
  config.imessage.bridge_executable = config.imessage.bridge_executable
    ?? path.join(process.cwd(), 'native', 'messages-helper', '.build', 'release', 'messages-helper');
  config.imessage.bridge_args = config.imessage.bridge_args ?? [];

  // Apply scheduler defaults
  if (!config.scheduler) {
    config.scheduler = {};
  }
  config.scheduler.check_interval_seconds = config.scheduler.check_interval_seconds ?? profileDefaults.scheduler.check_interval_seconds;
  config.scheduler.adaptive_mode = config.scheduler.adaptive_mode ?? true;  // Phase 3: Enable by default

  // Apply performance defaults
  if (!config.performance) {
    config.performance = {};
  }
  config.performance.parallel_message_processing = config.performance.parallel_message_processing ?? true;
  config.performance.batch_applescript_sends = config.performance.batch_applescript_sends ?? false;

  // Apply WebSocket defaults
  if (!config.websocket) {
    config.websocket = {};
  }
  config.websocket.enabled = config.websocket.enabled ?? true;
  config.websocket.reconnect_attempts = config.websocket.reconnect_attempts ?? 10;  // DEPRECATED: Ignored (kept for backward compatibility)
  config.websocket.ping_interval_seconds = config.websocket.ping_interval_seconds ?? 30;

  // Override with environment variables if present
  if (process.env.USER_PHONE) {
    config.edge.user_phone = process.env.USER_PHONE;
  }

  if (process.env.BACKEND_URL) {
    config.backend.url = process.env.BACKEND_URL;
  }

  // Expand home directory in paths
  config.imessage.db_path = config.imessage.db_path.replace(
    /^~/,
    process.env.HOME || ''
  );
  if (config.imessage.attachments_path) {
    config.imessage.attachments_path = config.imessage.attachments_path.replace(
      /^~/,
      process.env.HOME || ''
    );
  }

  if (!config.security) {
    config.security = {};
  }
  config.security.keychain_service = config.security.keychain_service ?? 'com.archety.edge';
  config.security.keychain_account = config.security.keychain_account ?? 'edge-state';

  // Ensure state database path exists
  if (!config.database.state_path) {
    config.database.state_path = './data/edge-state.db';
  }

  // Generate agent_id from phone number if not set
  if (!config.edge.agent_id || config.edge.agent_id === 'edge_15551234567') {
    const phoneDigits = config.edge.user_phone.replace(/[^0-9]/g, '');
    config.edge.agent_id = `edge_${phoneDigits}`;
  }

  return config;
}

/**
 * Validate configuration
 * NOTE: Most validation is now done by Zod schema in loadConfig()
 * This function only checks runtime conditions (e.g., file existence)
 */
export function validateConfig(config: Config): void {
  // Check if Messages DB exists (runtime check, not schema validation)
  if (!fs.existsSync(config.imessage.db_path)) {
    throw new Error(
      `Messages database not found at ${config.imessage.db_path}. ` +
      'Make sure iMessage is configured and you have Full Disk Access permissions.'
    );
  }

  // Additional runtime validations can go here
  // Schema validation (required fields, types, etc.) is handled by Zod
}
