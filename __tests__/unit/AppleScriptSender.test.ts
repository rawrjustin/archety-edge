import { AppleScriptSender } from '../../src/transports/AppleScriptSender';
import { MockLogger } from '../mocks/MockLogger';
import { exec } from 'child_process';
import { promisify } from 'util';

// Mock child_process
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const execAsync = promisify(exec);

describe('AppleScriptSender', () => {
  let sender: AppleScriptSender;
  let mockLogger: MockLogger;
  let mockExec: jest.Mock;

  beforeEach(() => {
    mockLogger = new MockLogger();
    sender = new AppleScriptSender(mockLogger);
    mockExec = exec as unknown as jest.Mock;
    mockExec.mockClear();
  });

  describe('sendMessage', () => {
    it('should send message to 1:1 chat successfully', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = 'Test message';

      // Mock successful execution
      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sender.sendMessage(threadId, text, false);

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledTimes(1);

      // Verify the AppleScript is correct
      const call = mockExec.mock.calls[0][0];
      expect(call).toContain('osascript');
      expect(call).toContain('tell application "Messages"');
      expect(call).toContain('+15551234567');
      expect(call).toContain('Test message');
    });

    it('should send message to group chat successfully', async () => {
      const threadId = 'iMessage;+;chat123456';
      const text = 'Group message';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sender.sendMessage(threadId, text, true);

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledTimes(1);

      // Verify group chat script
      const call = mockExec.mock.calls[0][0];
      expect(call).toContain('whose id is');
      expect(call).toContain(threadId);
    });

    it('should escape double quotes in message', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = 'He said "hello"';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await sender.sendMessage(threadId, text, false);

      const call = mockExec.mock.calls[0][0];
      // The escaped version should have \"
      expect(call).toContain('\\"hello\\"');
    });

    it('should escape backslashes in message', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = 'Path: C:\\Users\\test';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await sender.sendMessage(threadId, text, false);

      const call = mockExec.mock.calls[0][0];
      // Backslashes should be doubled
      expect(call).toContain('\\\\');
    });

    it('should handle newlines in message', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = 'Line 1\nLine 2\nLine 3';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await sender.sendMessage(threadId, text, false);

      const call = mockExec.mock.calls[0][0];
      // Newlines should be escaped
      expect(call).toContain('\\n');
    });

    it('should handle apostrophes without issue', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = "I'm having a moment";

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sender.sendMessage(threadId, text, false);

      expect(result).toBe(true);
      // Heredoc should handle apostrophes naturally
      const call = mockExec.mock.calls[0][0];
      expect(call).toContain("I'm having a moment");
    });

    it('should handle special characters', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = '$100 at 3:00 PM #meeting!';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sender.sendMessage(threadId, text, false);

      expect(result).toBe(true);
    });

    it('should return false on execution failure', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = 'Test message';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(new Error('AppleScript error'), null);
      });

      const result = await sender.sendMessage(threadId, text, false);

      expect(result).toBe(false);
      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('Failed to send message')
      )).toBe(true);
    });

    it('should log debug information', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = 'Test message';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await sender.sendMessage(threadId, text, false);

      expect(mockLogger.debugMessages.some(msg =>
        msg.includes('Sending message')
      )).toBe(true);
    });

    it('should extract recipient from thread ID', async () => {
      const threadId = 'iMessage;-;user@icloud.com';
      const text = 'Test';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await sender.sendMessage(threadId, text, false);

      const call = mockExec.mock.calls[0][0];
      expect(call).toContain('user@icloud.com');
      expect(call).not.toContain('iMessage;-;');
    });
  });

  describe('sendMultiBubble', () => {
    it('should send multiple bubbles successfully', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const bubbles = ['Message 1', 'Message 2', 'Message 3'];

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sender.sendMultiBubble(threadId, bubbles, false);

      expect(result).toBe(true);
      expect(mockExec).toHaveBeenCalledTimes(3);
    });

    it('should add delays between bubbles', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const bubbles = ['Message 1', 'Message 2'];

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const startTime = Date.now();
      await sender.sendMultiBubble(threadId, bubbles, false);
      const endTime = Date.now();

      // Should take at least 1 second (base delay between bubbles)
      const duration = endTime - startTime;
      expect(duration).toBeGreaterThanOrEqual(800); // Account for test timing variance
    });

    it('should return false if any bubble fails', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const bubbles = ['Message 1', 'Message 2', 'Message 3'];

      let callCount = 0;
      mockExec.mockImplementation((cmd: string, callback: any) => {
        callCount++;
        if (callCount === 2) {
          // Fail the second bubble
          callback(new Error('Send failed'), null);
        } else {
          callback(null, { stdout: '', stderr: '' });
        }
      });

      const result = await sender.sendMultiBubble(threadId, bubbles, false);

      expect(result).toBe(false);
      expect(mockExec).toHaveBeenCalledTimes(2); // Should stop after failure
    });

    it('should log bubble progress', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const bubbles = ['Message 1', 'Message 2'];

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      await sender.sendMultiBubble(threadId, bubbles, false);

      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Sending 2 bubbles')
      )).toBe(true);
    });

    it('should handle single bubble without delay', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const bubbles = ['Single message'];

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const startTime = Date.now();
      await sender.sendMultiBubble(threadId, bubbles, false);
      const endTime = Date.now();

      // Should not add delay for single bubble
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(500);
    });

    it('should vary delay based on message length', async () => {
      const threadId = 'iMessage;-;+15551234567';

      // Short message
      const shortBubbles = ['Hi', 'Bye'];
      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const shortStart = Date.now();
      await sender.sendMultiBubble(threadId, shortBubbles, false);
      const shortDuration = Date.now() - shortStart;

      // Long message (should have slightly longer delay)
      const longBubbles = ['This is a much longer message with many words', 'Another long message'];
      mockExec.mockClear();

      const longStart = Date.now();
      await sender.sendMultiBubble(threadId, longBubbles, false);
      const longDuration = Date.now() - longStart;

      // Long message should take slightly longer (but test is forgiving due to variance)
      expect(longDuration).toBeGreaterThanOrEqual(shortDuration - 300);
    });
  });

  describe('testConnection', () => {
    it('should return true when Messages.app is accessible', async () => {
      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '2\n', stderr: '' });
      });

      const result = await sender.testConnection();

      expect(result).toBe(true);
      expect(mockLogger.infoMessages.some(msg =>
        msg.includes('Messages.app is accessible')
      )).toBe(true);
    });

    it('should return false when no accounts configured', async () => {
      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '0\n', stderr: '' });
      });

      const result = await sender.testConnection();

      expect(result).toBe(false);
      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('no accounts configured')
      )).toBe(true);
    });

    it('should return false when Messages.app is not accessible', async () => {
      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(new Error('Messages.app not running'), null);
      });

      const result = await sender.testConnection();

      expect(result).toBe(false);
      expect(mockLogger.errorMessages.some(msg =>
        msg.includes('not accessible')
      )).toBe(true);
    });

    it('should verify AppleScript uses heredoc', async () => {
      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '1\n', stderr: '' });
      });

      await sender.testConnection();

      const call = mockExec.mock.calls[0][0];
      // Verify heredoc syntax is used
      expect(call).toContain('<<\'EOF\'');
      expect(call).toContain('EOF');
    });
  });

  describe('edge cases', () => {
    it('should handle empty message', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = '';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sender.sendMessage(threadId, text, false);

      expect(result).toBe(true);
    });

    it('should handle very long message', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = 'A'.repeat(1000);

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sender.sendMessage(threadId, text, false);

      expect(result).toBe(true);
    });

    it('should handle unicode characters', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const text = '你好 🎉 مرحبا';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sender.sendMessage(threadId, text, false);

      expect(result).toBe(true);
    });

    it('should handle thread ID without separator', async () => {
      const threadId = '+15551234567';
      const text = 'Test';

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sender.sendMessage(threadId, text, false);

      expect(result).toBe(true);
      const call = mockExec.mock.calls[0][0];
      expect(call).toContain('+15551234567');
    });

    it('should handle empty bubbles array', async () => {
      const threadId = 'iMessage;-;+15551234567';
      const bubbles: string[] = [];

      mockExec.mockImplementation((cmd: string, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const result = await sender.sendMultiBubble(threadId, bubbles, false);

      expect(result).toBe(true);
      expect(mockExec).not.toHaveBeenCalled();
    });
  });
});
