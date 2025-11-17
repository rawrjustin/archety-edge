#!/usr/bin/env node
/**
 * Admin Portal Entry Point
 * Starts both the EdgeAgent and the Admin Web Server
 */

import { EdgeAgent } from '../../src/index';
import { AdminServer, IAdminInterface } from './AdminServer';
import * as path from 'path';

/**
 * Wrapper class that implements IAdminInterface using EdgeAgent
 */
class EdgeAgentAdminAdapter implements IAdminInterface {
  constructor(private agent: EdgeAgent) {}

  async getStats() {
    return this.agent.getAdminStats();
  }

  async getScheduledMessages() {
    return this.agent.getScheduledMessages();
  }

  async getRules() {
    return this.agent.getRules();
  }

  async getPlans() {
    return this.agent.getPlans();
  }

  async cancelScheduledMessage(scheduleId: string) {
    return this.agent.cancelScheduledMessage(scheduleId);
  }

  async enableRule(ruleId: string) {
    return this.agent.enableRule(ruleId);
  }

  async disableRule(ruleId: string) {
    return this.agent.disableRule(ruleId);
  }

  async sendTestMessage(threadId: string, text: string) {
    return this.agent.sendTestMessage(threadId, text);
  }

  async testBackendConnection() {
    return this.agent.testBackendConnection();
  }
}

/**
 * Main entry point
 */
async function main() {
  console.log('='.repeat(60));
  console.log('Starting Edge Agent with Admin Portal');
  console.log('='.repeat(60));

  // Create EdgeAgent
  const agent = new EdgeAgent();

  // Create admin adapter
  const adminAdapter = new EdgeAgentAdminAdapter(agent);

  // Create admin server
  const configPath = path.join(process.cwd(), 'config.yaml');
  const adminPort = parseInt(process.env.ADMIN_PORT || '3100');
  const adminServer = new AdminServer(adminAdapter, configPath, adminPort);

  // Handle shutdown gracefully
  const shutdown = async () => {
    console.log('\n\nShutting down gracefully...');
    await adminServer.stop();
    agent.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Handle uncaught errors
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    await adminServer.stop();
    agent.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', async (error) => {
    console.error('Unhandled rejection:', error);
    await adminServer.stop();
    agent.stop();
    process.exit(1);
  });

  try {
    // Start the edge agent
    await agent.start();

    // Start the admin server
    await adminServer.start();

    console.log('='.repeat(60));
    console.log('✅ Edge Agent and Admin Portal are running!');
    console.log(`📊 Admin Portal: http://127.0.0.1:${adminPort}`);
    console.log(`🔑 Auth Token: ${adminServer.getAuthToken()}`);
    console.log('Press Ctrl+C to stop');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (require.main === module) {
  main();
}

export { main };
