import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface Config {
  edge: {
    agent_id: string;
    user_phone: string;
  };
  backend: {
    url: string;
    sync_interval_seconds: number;
  };
  imessage: {
    poll_interval_seconds: number;
    db_path: string;
  };
  database: {
    path: string;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    file: string;
  };
}

/**
 * Load configuration from config.yaml and environment variables
 * Environment variables take precedence over config file
 */
export function loadConfig(configPath: string = './config.yaml'): Config {
  // Load YAML config
  const configFile = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(configFile) as Config;

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
