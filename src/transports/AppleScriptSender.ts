import { exec } from 'child_process';
import { promisify } from 'util';
import { ILogger } from '../interfaces/ILogger';
import { RateLimiter } from '../utils/RateLimiter';

const execAsync = promisify(exec);

/**
 * AppleScriptSender - Send iMessages using AppleScript
 * This is the most reliable way to send messages without private APIs
 * ENHANCED: Now with input sanitization and rate limiting
 */
export class AppleScriptSender {
  private logger: ILogger;
  private rateLimiter: RateLimiter;
  private cleanupInterval: NodeJS.Timeout;

  constructor(logger: ILogger) {
    this.logger = logger;
    this.rateLimiter = new RateLimiter(logger);

    // Cleanup rate limiter every minute
    this.cleanupInterval = setInterval(() => this.rateLimiter.cleanup(), 60000);
  }

  /**
   * Sanitize text for AppleScript execution
   * Escapes special characters and validates for injection attempts
   */
  private sanitizeForAppleScript(text: string): string {
    // First check for dangerous patterns
    if (this.containsAppleScriptInjection(text)) {
      this.logger.error('❌ Detected potential AppleScript injection attempt');
      throw new Error('Message contains forbidden AppleScript commands');
    }

    // Escape special characters for AppleScript
    return text
      .replace(/\\/g, '\\\\')   // Backslash (must be first)
      .replace(/"/g, '\\"')     // Double quotes
      .replace(/\n/g, '\\n')    // Newlines
      .replace(/\r/g, '\\r')    // Carriage returns
      .replace(/\t/g, '\\t');   // Tabs
  }

  /**
   * Detect potential AppleScript injection attempts
   */
  private containsAppleScriptInjection(text: string): boolean {
    const dangerousPatterns = [
      /do shell script/i,
      /tell application "system events"/i,
      /tell application "finder"/i,
      /activate application/i,
      /\bexecute\b.*\bscript\b/i,
      /osascript/i,
      /applescript/i,
      /end tell.*tell/i  // Nested tell blocks
    ];

    return dangerousPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Sanitize thread ID to prevent injection
   */
  private sanitizeThreadId(threadId: string): string {
    // Only allow known-safe characters
    const sanitized = threadId.replace(/[^a-zA-Z0-9+@._\-;]/g, '');

    if (sanitized !== threadId) {
      this.logger.warn(`⚠️  Thread ID contained unsafe characters, sanitized: ${threadId} → ${sanitized}`);
    }

    if (sanitized.length === 0) {
      throw new Error('Invalid thread ID: contains only forbidden characters');
    }

    return sanitized;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }

  /**
   * Send a message to a thread
   */
  async sendMessage(threadId: string, text: string, isGroup: boolean): Promise<boolean> {
    try {
      // Check rate limit: max 120 messages per minute
      // Conservative vs Apple's undocumented iMessage limits.
      // Safe for existing conversations; Apple may soft-throttle at ~200/hr to new contacts.
      const allowed = await this.rateLimiter.checkLimit({
        maxRequests: 120,
        windowMs: 60000,
        identifier: 'send_message'
      });

      if (!allowed) {
        this.logger.error('❌ Rate limit exceeded for message sending');
        throw new Error('Rate limit exceeded: max 120 messages/minute');
      }

      // Validate message length
      if (text.length > 5000) {
        this.logger.error('❌ Message exceeds 5000 character limit');
        throw new Error('Message exceeds 5000 character limit');
      }

      this.logger.debug(`Sending message to ${threadId} (group: ${isGroup}): "${text.substring(0, 50)}..."`);

      // Sanitize inputs
      const safeThreadId = this.sanitizeThreadId(threadId);
      const escapedText = this.sanitizeForAppleScript(text);

      let script: string;

      if (isGroup) {
        // For group chats, use full chat ID format
        // Messages.app expects "iMessage;+;chatXXX" format, but we receive just "chatXXX" from the database
        const fullChatId = safeThreadId.startsWith('iMessage;') ? safeThreadId : `iMessage;+;${safeThreadId}`;
        script = `tell application "Messages"
  set targetChat to first chat whose id is "${fullChatId}"
  send "${escapedText}" to targetChat
end tell`;
      } else {
        // For 1:1 chats, extract recipient from thread ID
        const recipient = this.extractRecipientFromThreadId(safeThreadId);
        const safeRecipient = this.sanitizeThreadId(recipient);
        script = `tell application "Messages"
  set targetService to 1st account whose service type = iMessage
  set targetBuddy to participant "${safeRecipient}" of targetService
  send "${escapedText}" to targetBuddy
end tell`;
      }

      // Execute AppleScript using heredoc to avoid shell escaping issues
      // This is more reliable than trying to escape quotes in the shell command
      await execAsync(`osascript <<'EOF'
${script}
EOF`);

      this.logger.info(`✅ Sent message to ${safeThreadId}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ Failed to send message to ${threadId}:`, error.message);

      // Don't return false for rate limit or validation errors - throw instead
      if (error.message.includes('Rate limit') || error.message.includes('forbidden') || error.message.includes('exceeds')) {
        throw error;
      }

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
      // Sanitize thread ID once
      const safeThreadId = this.sanitizeThreadId(threadId);

      // Build AppleScript commands for all bubbles with delays
      const bubbleCommands = bubbles.map((bubble, i) => {
        // Sanitize text for AppleScript
        const escapedText = this.sanitizeForAppleScript(bubble);

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
        // For group chats, use full chat ID format
        // Messages.app expects "iMessage;+;chatXXX" format, but we receive just "chatXXX" from the database
        const fullChatId = safeThreadId.startsWith('iMessage;') ? safeThreadId : `iMessage;+;${safeThreadId}`;
        script = `tell application "Messages"
    set targetChat to first chat whose id is "${fullChatId}"
    ${bubbleCommands}
  end tell`;
      } else {
        // For 1:1 chats, extract recipient and send to targetBuddy
        const recipient = this.extractRecipientFromThreadId(safeThreadId);
        const safeRecipient = this.sanitizeThreadId(recipient);
        // Replace 'targetChat' with 'targetBuddy' in bubble commands
        const fixedCommands = bubbleCommands.replace(/to targetChat/g, 'to targetBuddy');
        script = `tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant "${safeRecipient}" of targetService
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
