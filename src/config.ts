import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as dotenv from 'dotenv';

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

export interface Config {
  edge: {
    agent_id: string;
    user_phone: string;
  };
  backend: {
    url: string;
    sync_interval_seconds: number;
    request_timeout_ms?: number;  // Default: 10000
    max_concurrent_requests?: number;  // Default: 3
  };
  websocket?: {
    enabled?: boolean;  // Default: true (enable WebSocket for real-time commands)
    reconnect_attempts?: number;  // DEPRECATED: Ignored (WebSocket now retries indefinitely)
    ping_interval_seconds?: number;  // Default: 30
  };
  imessage: {
    poll_interval_seconds: number;
    db_path: string;
    enable_fast_check?: boolean;  // Default: true (pre-check before JOINs)
    max_messages_per_poll?: number;  // Default: 100
  };
  database: {
    path: string;
  };
  scheduler?: {
    check_interval_seconds?: number;  // Default: 30
    adaptive_mode?: boolean;  // Default: true (Phase 3: near-instant delivery)
  };
  performance?: {
    profile?: 'balanced' | 'low-latency' | 'low-resource';  // Default: 'balanced'
    parallel_message_processing?: boolean;  // Default: true
    batch_applescript_sends?: boolean;  // Default: false (future optimization)
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file: string;
  };
}

/**
 * Load configuration from config.yaml and environment variables
 * Environment variables take precedence over config file
 * ENHANCED: Supports performance profiles and optimized defaults
 */
export function loadConfig(configPath: string = './config.yaml'): Config {
  // Load YAML config
  const configFile = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(configFile) as Config;

  // Apply performance profile if specified
  const profile = config.performance?.profile || 'balanced';
  const profileDefaults = PERFORMANCE_PROFILES[profile];

  // Apply defaults from profile
  config.backend.request_timeout_ms = config.backend.request_timeout_ms ?? profileDefaults.backend.request_timeout_ms;
  config.backend.max_concurrent_requests = config.backend.max_concurrent_requests ?? profileDefaults.backend.max_concurrent_requests;
  config.imessage.enable_fast_check = config.imessage.enable_fast_check ?? profileDefaults.imessage.enable_fast_check;
  config.imessage.max_messages_per_poll = config.imessage.max_messages_per_poll ?? profileDefaults.imessage.max_messages_per_poll;

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

  // Generate agent_id from phone number if not set
  if (!config.edge.agent_id || config.edge.agent_id === 'edge_15551234567') {
    const phoneDigits = config.edge.user_phone.replace(/[^0-9]/g, '');
    config.edge.agent_id = `edge_${phoneDigits}`;
  }

  return config;
}

/**
 * Validate configuration
 */
export function validateConfig(config: Config): void {
  if (!config.edge.user_phone) {
    throw new Error('user_phone is required in config');
  }

  if (!config.backend.url) {
    throw new Error('backend URL is required in config');
  }

  if (!config.imessage.db_path) {
    throw new Error('imessage db_path is required in config');
  }

  // Check if Messages DB exists
  if (!fs.existsSync(config.imessage.db_path)) {
    throw new Error(
      `Messages database not found at ${config.imessage.db_path}. ` +
      'Make sure iMessage is configured and you have Full Disk Access permissions.'
    );
  }
}
