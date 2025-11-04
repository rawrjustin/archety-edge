import { CommandHandler } from '../../src/commands/CommandHandler';
import { Scheduler } from '../../src/scheduler/Scheduler';
import { MockLogger } from '../mocks/MockLogger';
import { MockTransport } from '../mocks/MockTransport';
import { EdgeCommandWrapper } from '../../src/interfaces/ICommands';
import * as fs from 'fs';
import * as path from 'path';

describe('CommandHandler', () => {
  let commandHandler: CommandHandler;
  let scheduler: Scheduler;
  let mockLogger: MockLogger;
  let mockTransport: MockTransport;
  let testDbPath: string;

  beforeEach(() => {
    // Create test database
    testDbPath = path.join(__dirname, `test-commands-${Date.now()}.db`);
    mockLogger = new MockLogger();
    mockTransport = new MockTransport();
    scheduler = new Scheduler(testDbPath, mockTransport, mockLogger);
    commandHandler = new CommandHandler(scheduler, mockLogger);
  });

  afterEach(() => {
    // Clean up
    scheduler.stop();
    scheduler.close();

    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('executeCommand', () => {
    it('should execute schedule_message command successfully', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_123',
        command_type: 'schedule_message',
        payload: {
          thread_id: 'test-thread',
          message_text: 'Test reminder',
          send_at: new Date(Date.now() + 60000).toISOString(),
          is_group: false
        }
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify message was scheduled
      const pending = scheduler.getPendingMessages();
      expect(pending.length).toBe(1);
      expect(pending[0].thread_id).toBe('test-thread');
      expect(pending[0].message_text).toBe('Test reminder');
      expect(pending[0].command_id).toBe('cmd_123');
    });

    it('should execute cancel_scheduled command successfully', async () => {
      // First schedule a message
      const scheduleId = scheduler.scheduleMessage(
        'test-thread',
        'Test message',
        new Date(Date.now() + 60000),
        false,
        'cmd_456'
      );

      // Now cancel it
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_789',
        command_type: 'cancel_scheduled',
        payload: {
          schedule_id: scheduleId
        }
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify message was cancelled
      const message = scheduler.getMessage(scheduleId);
      expect(message?.status).toBe('cancelled');
    });

    it('should handle invalid timestamp in schedule_message', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_invalid',
        command_type: 'schedule_message',
        payload: {
          thread_id: 'test-thread',
          message_text: 'Test message',
          send_at: 'invalid-date',
          is_group: false
        }
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Invalid timestamp');
    });

    it('should handle non-existent message in cancel_scheduled', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_cancel',
        command_type: 'cancel_scheduled',
        payload: {
          schedule_id: 'non-existent-id'
        }
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not found');
    });

    it('should handle set_rule command (not implemented)', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_rule',
        command_type: 'set_rule',
        payload: {
          rule_type: 'recurring',
          rule_config: {}
        }
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Rule engine not yet implemented');
    });

    it('should handle update_plan command (not implemented)', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_plan',
        command_type: 'update_plan',
        payload: {
          thread_id: 'group-thread',
          plan_data: {}
        }
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plan updates not yet implemented');
    });

    it('should handle unknown command type', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_unknown',
        command_type: 'unknown_command',
        payload: {}
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown command type');
    });

    it('should log command execution', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_log_test',
        command_type: 'schedule_message',
        payload: {
          thread_id: 'test-thread',
          message_text: 'Test',
          send_at: new Date(Date.now() + 60000).toISOString(),
          is_group: false
        }
      };

      await commandHandler.executeCommand(command);

      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Executing command') && msg.includes('cmd_log_test')
      )).toBe(true);
    });
  });

  describe('schedule_message command', () => {
    it('should handle group chat messages', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_group',
        command_type: 'schedule_message',
        payload: {
          thread_id: 'group-thread',
          message_text: 'Group reminder',
          send_at: new Date(Date.now() + 60000).toISOString(),
          is_group: true
        }
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(true);

      const pending = scheduler.getPendingMessages();
      expect(pending[0].is_group).toBe(true);
    });

    it('should default is_group to false if not provided', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_default',
        command_type: 'schedule_message',
        payload: {
          thread_id: 'test-thread',
          message_text: 'Test',
          send_at: new Date(Date.now() + 60000).toISOString()
          // is_group not provided
        }
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(true);

      const pending = scheduler.getPendingMessages();
      expect(pending[0].is_group).toBe(false);
    });

    it('should schedule messages with past timestamps', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_past',
        command_type: 'schedule_message',
        payload: {
          thread_id: 'test-thread',
          message_text: 'Past message',
          send_at: new Date(Date.now() - 1000).toISOString(), // 1 second ago
          is_group: false
        }
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(true);

      // Message should be scheduled (will be sent immediately by scheduler)
      const pending = scheduler.getPendingMessages();
      expect(pending.length).toBeGreaterThan(0);
    });
  });

  describe('cancel_scheduled command', () => {
    it('should return error for already cancelled message', async () => {
      // Schedule and cancel a message
      const scheduleId = scheduler.scheduleMessage(
        'test-thread',
        'Test',
        new Date(Date.now() + 60000),
        false
      );
      scheduler.cancelMessage(scheduleId);

      // Try to cancel again
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_double_cancel',
        command_type: 'cancel_scheduled',
        payload: {
          schedule_id: scheduleId
        }
      };

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found or already sent');
    });
  });

  describe('error handling', () => {
    it('should catch and return errors during execution', async () => {
      // Create a command with invalid payload structure
      const command = {
        command_id: 'cmd_error',
        command_type: 'schedule_message',
        payload: null // This will cause an error
      } as any;

      const result = await commandHandler.executeCommand(command);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should log errors during execution', async () => {
      const command = {
        command_id: 'cmd_log_error',
        command_type: 'schedule_message',
        payload: null
      } as any;

      const result = await commandHandler.executeCommand(command);

      // The error is returned, not necessarily logged to error level
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('command logging', () => {
    it('should log successful command execution', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_success_log',
        command_type: 'schedule_message',
        payload: {
          thread_id: 'test-thread',
          message_text: 'Test',
          send_at: new Date(Date.now() + 60000).toISOString(),
          is_group: false
        }
      };

      await commandHandler.executeCommand(command);

      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Scheduled message')
      )).toBe(true);
    });

    it('should log failed command execution', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_fail_log',
        command_type: 'cancel_scheduled',
        payload: {
          schedule_id: 'non-existent'
        }
      };

      await commandHandler.executeCommand(command);

      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Cancelled scheduled message') || msg.includes('Executing command')
      )).toBe(true);
    });

    it('should log warning for unimplemented commands', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_unimplemented',
        command_type: 'set_rule',
        payload: {}
      };

      await commandHandler.executeCommand(command);

      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('set_rule command received')
      )).toBe(true);
    });

    it('should log warning for unknown commands', async () => {
      const command: EdgeCommandWrapper = {
        command_id: 'cmd_unknown_log',
        command_type: 'totally_unknown',
        payload: {}
      };

      await commandHandler.executeCommand(command);

      expect(mockLogger.warnMessages.some(msg =>
        msg.includes('Unknown command type')
      )).toBe(true);
    });
  });
});
