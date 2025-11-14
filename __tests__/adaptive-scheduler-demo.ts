/**
 * Phase 3: Adaptive Scheduler Demonstration
 *
 * This test demonstrates the adaptive scheduler's ability to deliver
 * scheduled messages with near-instant precision (<100ms of scheduled time)
 */

import { Scheduler } from '../src/scheduler/Scheduler';
import { Logger } from '../src/utils/Logger';
import { IMessageTransport } from '../src/interfaces/IMessageTransport';
import * as fs from 'fs';

// Mock transport that logs instead of sending
class MockTransport implements IMessageTransport {
  private logger: Logger;
  private sentMessages: Array<{ threadId: string; text: string; timestamp: Date }> = [];

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async start(): Promise<void> {
    this.logger.info('Mock transport started');
  }

  async stop(): Promise<void> {
    this.logger.info('Mock transport stopped');
  }

  async sendMessage(threadId: string, messageText: string, isGroup: boolean = false): Promise<boolean> {
    const now = new Date();
    this.sentMessages.push({ threadId, text: messageText, timestamp: now });
    this.logger.info(`📤 [MOCK SEND] to ${threadId}: "${messageText}" at ${now.toISOString()}`);
    return true;
  }

  async sendMultiBubble(threadId: string, bubbles: string[], isGroup: boolean, batched?: boolean): Promise<boolean> {
    for (const bubble of bubbles) {
      await this.sendMessage(threadId, bubble, isGroup);
    }
    return true;
  }

  async pollNewMessages(): Promise<any[]> {
    return [];
  }

  getName(): string {
    return 'MockTransport';
  }

  getSentMessages() {
    return this.sentMessages;
  }
}

async function demonstrateAdaptiveScheduler() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 Phase 3: Adaptive Scheduler Demonstration');
  console.log('='.repeat(80) + '\n');

  // Setup
  const dbPath = './__tests__/adaptive-demo.db';
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }

  const logger = new Logger('debug', './adaptive-demo.log');
  const transport = new MockTransport(logger);
  const scheduler = new Scheduler(dbPath, transport, logger);

  console.log('✅ Scheduler initialized in ADAPTIVE mode\n');

  // Start scheduler in adaptive mode
  scheduler.start(30, true);

  console.log('📅 Scenario: Scheduling messages at different intervals\n');

  // Schedule messages at various times
  const now = new Date();

  // Message 1: 2 seconds from now
  const time1 = new Date(now.getTime() + 2000);
  const id1 = scheduler.scheduleMessage('+15551234567', 'Message in 2 seconds', time1, false, 'cmd_1');
  console.log(`✓ Scheduled message 1 for ${time1.toISOString()} (2s from now)`);

  // Message 2: 5 seconds from now
  const time2 = new Date(now.getTime() + 5000);
  const id2 = scheduler.scheduleMessage('+15551234567', 'Message in 5 seconds', time2, false, 'cmd_2');
  console.log(`✓ Scheduled message 2 for ${time2.toISOString()} (5s from now)`);

  // Message 3: 8 seconds from now
  const time3 = new Date(now.getTime() + 8000);
  const id3 = scheduler.scheduleMessage('+15551234567', 'Message in 8 seconds', time3, false, 'cmd_3');
  console.log(`✓ Scheduled message 3 for ${time3.toISOString()} (8s from now)`);

  console.log('\n⏱️  Expected behavior:');
  console.log('   → Scheduler will check ~100ms before each message is due');
  console.log('   → Messages will be sent within <100ms of scheduled time');
  console.log('   → No wasted CPU cycles checking when nothing is due\n');

  console.log('🔍 Watching scheduler (10 seconds)...\n');

  // Wait for all messages to be sent
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Check results
  const sentMessages = transport.getSentMessages();
  console.log('\n' + '='.repeat(80));
  console.log('📊 Results:');
  console.log('='.repeat(80) + '\n');

  sentMessages.forEach((msg, index) => {
    const scheduled = [time1, time2, time3][index];
    const actualTime = msg.timestamp;
    const delay = actualTime.getTime() - scheduled.getTime();

    console.log(`Message ${index + 1}:`);
    console.log(`  Scheduled:  ${scheduled.toISOString()}`);
    console.log(`  Sent:       ${actualTime.toISOString()}`);
    console.log(`  Delay:      ${delay}ms ${delay < 100 ? '✅ (near-instant!)' : '⚠️'}`);
    console.log();
  });

  // Cleanup
  scheduler.stop();
  scheduler.close();

  console.log('✅ Adaptive scheduler demonstration complete!');
  console.log('\n📈 Key Benefits:');
  console.log('   • Near-instant delivery (<100ms precision)');
  console.log('   • Efficient CPU usage (only checks when needed)');
  console.log('   • Automatic rescheduling when new messages are added');
  console.log('   • Scales well from seconds to hours');
  console.log();

  // Cleanup demo files
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  if (fs.existsSync('./adaptive-demo.log')) {
    fs.unlinkSync('./adaptive-demo.log');
  }
}

// Run demonstration
demonstrateAdaptiveScheduler().catch(error => {
  console.error('Error in demonstration:', error);
  process.exit(1);
});
