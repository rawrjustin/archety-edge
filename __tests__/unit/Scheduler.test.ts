import { Scheduler } from '../../src/scheduler/Scheduler';
import { MockLogger } from '../mocks/MockLogger';
import { MockTransport } from '../mocks/MockTransport';
import * as fs from 'fs';
import * as path from 'path';

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let mockLogger: MockLogger;
  let mockTransport: MockTransport;
  let testDbPath: string;

  beforeEach(() => {
    // Create a unique test database for each test
    testDbPath = path.join(__dirname, `test-scheduler-${Date.now()}.db`);
    mockLogger = new MockLogger();
    mockTransport = new MockTransport();
    scheduler = new Scheduler(testDbPath, mockTransport, mockLogger);
  });

  afterEach(() => {
    // Clean up
    scheduler.stop();
    scheduler.close();

    // Delete test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('scheduleMessage', () => {
    it('should schedule a message successfully', () => {
      const threadId = 'test-thread';
      const messageText = 'Test reminder';
      const sendAt = new Date(Date.now() + 60000); // 1 minute from now

      const scheduleId = scheduler.scheduleMessage(threadId, messageText, sendAt, false);

      expect(scheduleId).toBeDefined();
      expect(typeof scheduleId).toBe('string');
      expect(scheduleId.length).toBeGreaterThan(0);
    });

    it('should store message in database', () => {
      const threadId = 'test-thread';
      const messageText = 'Test reminder';
      const sendAt = new Date(Date.now() + 60000);

      const scheduleId = scheduler.scheduleMessage(threadId, messageText, sendAt, false);

      const message = scheduler.getMessage(scheduleId);
      expect(message).toBeDefined();
      expect(message?.thread_id).toBe(threadId);
      expect(message?.message_text).toBe(messageText);
      expect(message?.status).toBe('pending');
      expect(message?.is_group).toBe(false);
    });

    it('should handle group chat messages', () => {
      const threadId = 'group-thread';
      const messageText = 'Group reminder';
      const sendAt = new Date(Date.now() + 60000);

      const scheduleId = scheduler.scheduleMessage(threadId, messageText, sendAt, true);

      const message = scheduler.getMessage(scheduleId);
      expect(message?.is_group).toBe(true);
    });

    it('should store command ID if provided', () => {
      const threadId = 'test-thread';
      const messageText = 'Test reminder';
      const sendAt = new Date(Date.now() + 60000);
      const commandId = 'cmd_123';

      const scheduleId = scheduler.scheduleMessage(threadId, messageText, sendAt, false, commandId);

      const message = scheduler.getMessage(scheduleId);
      expect(message?.command_id).toBe(commandId);
    });
  });

  describe('cancelMessage', () => {
    it('should cancel a pending message', () => {
      const scheduleId = scheduler.scheduleMessage(
        'test-thread',
        'Test message',
        new Date(Date.now() + 60000),
        false
      );

      const cancelled = scheduler.cancelMessage(scheduleId);

      expect(cancelled).toBe(true);
      const message = scheduler.getMessage(scheduleId);
      expect(message?.status).toBe('cancelled');
    });

    it('should return false for non-existent message', () => {
      const cancelled = scheduler.cancelMessage('non-existent-id');

      expect(cancelled).toBe(false);
    });

    it('should not cancel already sent message', () => {
      // Schedule message in the past
      const scheduleId = scheduler.scheduleMessage(
        'test-thread',
        'Past message',
        new Date(Date.now() - 1000),
        false
      );

      // Start scheduler to send the message
      scheduler.start(1);

      // Wait for execution
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          scheduler.stop();

          // Try to cancel
          const cancelled = scheduler.cancelMessage(scheduleId);

          expect(cancelled).toBe(false);
          resolve();
        }, 2000);
      });
    });
  });

  describe('getMessage', () => {
    it('should retrieve a scheduled message', () => {
      const scheduleId = scheduler.scheduleMessage(
        'test-thread',
        'Test message',
        new Date(Date.now() + 60000),
        false
      );

      const message = scheduler.getMessage(scheduleId);

      expect(message).toBeDefined();
      expect(message?.id).toBe(scheduleId);
    });

    it('should return null for non-existent message', () => {
      const message = scheduler.getMessage('non-existent-id');

      expect(message).toBeNull();
    });
  });

  describe('getPendingMessages', () => {
    it('should return all pending messages', () => {
      // Schedule multiple messages
      scheduler.scheduleMessage('thread1', 'Message 1', new Date(Date.now() + 60000), false);
      scheduler.scheduleMessage('thread2', 'Message 2', new Date(Date.now() + 120000), false);
      scheduler.scheduleMessage('thread3', 'Message 3', new Date(Date.now() + 180000), false);

      const pending = scheduler.getPendingMessages();

      expect(pending.length).toBe(3);
      expect(pending.every(msg => msg.status === 'pending')).toBe(true);
    });

    it('should order messages by send time', () => {
      const now = Date.now();
      scheduler.scheduleMessage('thread1', 'Message 1', new Date(now + 180000), false);
      scheduler.scheduleMessage('thread2', 'Message 2', new Date(now + 60000), false);
      scheduler.scheduleMessage('thread3', 'Message 3', new Date(now + 120000), false);

      const pending = scheduler.getPendingMessages();

      expect(pending[0].message_text).toBe('Message 2');
      expect(pending[1].message_text).toBe('Message 3');
      expect(pending[2].message_text).toBe('Message 1');
    });

    it('should not include cancelled messages', () => {
      const scheduleId1 = scheduler.scheduleMessage('thread1', 'Message 1', new Date(Date.now() + 60000), false);
      scheduler.scheduleMessage('thread2', 'Message 2', new Date(Date.now() + 120000), false);

      scheduler.cancelMessage(scheduleId1);

      const pending = scheduler.getPendingMessages();

      expect(pending.length).toBe(1);
      expect(pending[0].message_text).toBe('Message 2');
    });
  });

  describe('message execution', () => {
    it('should send message at scheduled time', () => {
      // Schedule message 1 second in the past (should send immediately)
      const threadId = 'test-thread';
      const messageText = 'Test message';
      const scheduleId = scheduler.scheduleMessage(
        threadId,
        messageText,
        new Date(Date.now() - 1000),
        false
      );

      // Start scheduler
      scheduler.start(1);

      // Wait for execution
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          scheduler.stop();

          // Check message was sent
          expect(mockTransport.sentMessages.length).toBe(1);
          expect(mockTransport.sentMessages[0].threadId).toBe(threadId);
          expect(mockTransport.sentMessages[0].text).toBe(messageText);

          // Check status updated
          const message = scheduler.getMessage(scheduleId);
          expect(message?.status).toBe('sent');

          resolve();
        }, 2000);
      });
    });

    it('should handle transport failure', () => {
      // Make transport fail
      mockTransport.shouldFail = true;

      // Schedule message in the past
      const scheduleId = scheduler.scheduleMessage(
        'test-thread',
        'Test message',
        new Date(Date.now() - 1000),
        false
      );

      // Start scheduler
      scheduler.start(1);

      // Wait for execution
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          scheduler.stop();

          // Check message was NOT sent
          expect(mockTransport.sentMessages.length).toBe(0);

          // Check status updated to failed
          const message = scheduler.getMessage(scheduleId);
          expect(message?.status).toBe('failed');
          expect(message?.error_message).toBeTruthy();

          resolve();
        }, 2000);
      });
    });

    it('should not send future messages', () => {
      // Schedule message 60 seconds in the future
      scheduler.scheduleMessage(
        'test-thread',
        'Future message',
        new Date(Date.now() + 60000),
        false
      );

      // Start scheduler
      scheduler.start(1);

      // Wait briefly
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          scheduler.stop();

          // Check message was NOT sent
          expect(mockTransport.sentMessages.length).toBe(0);

          resolve();
        }, 2000);
      });
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      // Schedule some messages
      const id1 = scheduler.scheduleMessage('thread1', 'Message 1', new Date(Date.now() + 60000), false);
      scheduler.scheduleMessage('thread2', 'Message 2', new Date(Date.now() + 120000), false);
      const id3 = scheduler.scheduleMessage('thread3', 'Message 3', new Date(Date.now() + 180000), false);

      // Cancel one
      scheduler.cancelMessage(id1);

      // Mark one as sent (hack for testing)
      scheduler.scheduleMessage('thread4', 'Message 4', new Date(Date.now() - 1000), false);
      scheduler.start(1);

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          scheduler.stop();

          const stats = scheduler.getStats();

          expect(stats.pending).toBe(2); // Two still pending
          expect(stats.cancelled).toBe(1); // One cancelled
          expect(stats.sent).toBe(1); // One sent

          resolve();
        }, 2000);
      });
    });
  });

  describe('scheduler lifecycle', () => {
    it('should start and stop cleanly', () => {
      scheduler.start(30);
      expect(mockLogger.infoMessages.some(msg => msg.includes('Starting scheduler'))).toBe(true);

      scheduler.stop();
      // Should not throw
    });

    it('should warn if started twice', () => {
      scheduler.start(30);
      scheduler.start(30);

      expect(mockLogger.warnMessages.some(msg => msg.includes('already running'))).toBe(true);
    });

    it('should handle stop without start', () => {
      scheduler.stop();
      // Should not throw
    });
  });
});
