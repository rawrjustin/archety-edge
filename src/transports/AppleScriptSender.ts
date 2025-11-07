import { exec } from 'child_process';
import { promisify } from 'util';
import { ILogger } from '../interfaces/ILogger';

const execAsync = promisify(exec);

/**
 * AppleScriptSender - Send iMessages using AppleScript
 * This is the most reliable way to send messages without private APIs
 */
export class AppleScriptSender {
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Send a message to a thread
   */
  async sendMessage(threadId: string, text: string, isGroup: boolean): Promise<boolean> {
    try {
      this.logger.debug(`Sending message to ${threadId} (group: ${isGroup}): "${text.substring(0, 50)}..."`);

      // Escape text for AppleScript (inside double quotes)
      // We need to escape backslashes, double quotes, and handle newlines
      const escapedText = text
        .replace(/\\/g, '\\\\')      // Escape backslashes first
        .replace(/"/g, '\\"')         // Escape double quotes
        .replace(/\n/g, '\\n')        // Handle newlines
        .replace(/\r/g, '');          // Remove carriage returns

      let script: string;

      if (isGroup) {
        // For group chats, use chat ID directly
        script = `tell application "Messages"
  set targetChat to first chat whose id is "${threadId}"
  send "${escapedText}" to targetChat
end tell`;
      } else {
        // For 1:1 chats, extract recipient from thread ID
        const recipient = this.extractRecipientFromThreadId(threadId);
        script = `tell application "Messages"
  set targetService to 1st account whose service type = iMessage
  set targetBuddy to participant "${recipient}" of targetService
  send "${escapedText}" to targetBuddy
end tell`;
      }

      // Execute AppleScript using heredoc to avoid shell escaping issues
      // This is more reliable than trying to escape quotes in the shell command
      await execAsync(`osascript <<'EOF'
${script}
EOF`);

      this.logger.info(`✅ Sent message to ${threadId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Failed to send message to ${threadId}:`, error.message);
      return false;
    }
  }

  /**
   * Extract recipient (phone/email) from thread ID
   * Thread ID format: "iMessage;-;+15551234567" or "iMessage;-;user@icloud.com"
   */
  private extractRecipientFromThreadId(threadId: string): string {
    const parts = threadId.split(';-;');
    if (parts.length > 1) {
      return parts[1];
    }
    return threadId;
  }

  /**
   * Send multiple message bubbles with natural timing
   * ENHANCED: Optionally batch into single AppleScript for 5× performance improvement
   */
  async sendMultiBubble(threadId: string, bubbles: string[], isGroup: boolean, batched: boolean = true): Promise<boolean> {
    try {
      this.logger.info(`Sending ${bubbles.length} bubbles to ${threadId} (batched: ${batched})`);

      // OPTIMIZATION: Batch mode - single AppleScript execution for all bubbles
      if (batched && bubbles.length > 1) {
        return await this.sendMultiBubbleBatched(threadId, bubbles, isGroup);
      }

      // Legacy mode - sequential sends with delays (kept for compatibility)
      for (let i = 0; i < bubbles.length; i++) {
        const bubble = bubbles[i];

        // Send the bubble
        const sent = await this.sendMessage(threadId, bubble, isGroup);

        if (!sent) {
          this.logger.error(`❌ Failed to send bubble ${i + 1}/${bubbles.length}`);
          return false;
        }

        // Add natural delay between bubbles (except after the last one)
        if (i < bubbles.length - 1) {
          // Vary delay based on bubble length for natural feel
          const baseDelay = 1.0; // seconds
          const lengthFactor = Math.min(bubble.length / 50, 1.0); // 0-1 based on length
          let delay = baseDelay + (lengthFactor * 1.0); // 1-2 seconds

          // Add small random variation for human feel
          delay += (Math.random() - 0.5) * 0.4; // -0.2 to +0.2 seconds

          this.logger.debug(`Waiting ${delay.toFixed(2)}s before next bubble...`);
          await this.sleep(delay * 1000); // Convert to milliseconds
        }
      }

      this.logger.info(`✅ Sent all ${bubbles.length} bubbles to ${threadId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Failed to send multi-bubble to ${threadId}:`, error.message);
      return false;
    }
  }

  /**
   * OPTIMIZATION: Send multiple bubbles in a single AppleScript execution
   * Reduces overhead from ~150ms × N to ~150ms total (5× faster for 5 bubbles)
   */
  private async sendMultiBubbleBatched(threadId: string, bubbles: string[], isGroup: boolean): Promise<boolean> {
    try {
      // Build AppleScript commands for all bubbles with delays
      const bubbleCommands = bubbles.map((bubble, i) => {
        // Escape text for AppleScript
        const escapedText = bubble
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '');

        // Calculate delay based on previous bubble length
        if (i > 0) {
          const prevBubble = bubbles[i - 1];
          const baseDelay = 1.0;
          const lengthFactor = Math.min(prevBubble.length / 50, 1.0);
          const delay = baseDelay + (lengthFactor * 1.0);
          const randomVariation = (Math.random() - 0.5) * 0.4;
          const totalDelay = delay + randomVariation;

          return `delay ${totalDelay.toFixed(2)}\n    send "${escapedText}" to targetChat`;
        } else {
          return `send "${escapedText}" to targetChat`;
        }
      }).join('\n    ');

      // Build complete AppleScript
      let script: string;
      if (isGroup) {
        script = `tell application "Messages"
    set targetChat to first chat whose id is "${threadId}"
    ${bubbleCommands}
  end tell`;
      } else {
        // For 1:1 chats, extract recipient and send to targetBuddy
        const recipient = this.extractRecipientFromThreadId(threadId);
        // Replace 'targetChat' with 'targetBuddy' in bubble commands
        const fixedCommands = bubbleCommands.replace(/to targetChat/g, 'to targetBuddy');
        script = `tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant "${recipient}" of targetService
    ${fixedCommands}
  end tell`;
      }

      // Execute single AppleScript with all bubbles
      await execAsync(`osascript <<'EOF'\n${script}\nEOF`);

      this.logger.info(`✅ Sent all ${bubbles.length} bubbles in batched mode`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Batched send failed:`, error.message);
      // Fall back to sequential mode
      this.logger.info('Falling back to sequential send mode...');
      return await this.sendMultiBubble(threadId, bubbles, isGroup, false);
    }
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test if Messages.app is running and accessible
   */
  async testConnection(): Promise<boolean> {
    try {
      const script = `tell application "Messages"
  return count of accounts
end tell`;
      const result = await execAsync(`osascript <<'EOF'
${script}
EOF`);
      const accountCount = parseInt(result.stdout.trim());
      if (accountCount > 0) {
        this.logger.info(`✅ Messages.app is accessible (${accountCount} accounts)`);
        return true;
      } else {
        this.logger.error('❌ Messages.app has no accounts configured');
        return false;
      }
    } catch (error: any) {
      this.logger.error('❌ Messages.app is not accessible:', error.message);
      this.logger.error('Make sure Messages.app is running and you have Automation permissions');
      return false;
    }
  }
}
