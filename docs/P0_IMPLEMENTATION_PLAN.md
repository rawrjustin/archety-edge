# P0 Issues Implementation Plan

**Timeline:** 3-4 days (24-32 hours)
**Priority:** Critical - Must complete before production scaling

---

## Overview

This plan addresses all P0 (critical) issues identified in the senior engineering review and sets up production-grade monitoring using Sentry and Amplitude.

### Issues to Fix

1. **P0-1:** Type Safety Issues (6 hours)
2. **P0-2:** Input Validation & Security (8 hours)
3. **P0-3:** Memory Leaks (4 hours)
4. **Monitoring:** Sentry Integration (4 hours)
5. **Analytics:** Amplitude Integration (3 hours)
6. **Alerting:** Setup Alert Rules (2 hours)

**Total Estimated Time:** 27 hours (~3.5 days)

---

## P0-1: Fix Type Safety Issues (6 hours)

### Problem
Excessive use of `any` types bypasses TypeScript's type checking, leading to runtime errors and maintenance issues.

### Files to Modify
- `src/index.ts` (EdgeAgent class)
- `src/config.ts` (config loading)
- `src/backend/RailwayClient.ts` (error handling)
- `src/scheduler/Scheduler.ts` (row mapping)
- `src/commands/CommandHandler.ts` (payload types)

### Implementation Steps

#### Step 1: Install Runtime Validation Library (30 min)
```bash
npm install zod
npm install --save-dev @types/better-sqlite3
```

#### Step 2: Create Strong Type Definitions (1.5 hours)

**File: `src/types/message.types.ts` (NEW)**
```typescript
import { z } from 'zod';

// Zod schema for runtime validation
export const IncomingMessageSchema = z.object({
  threadId: z.string().min(1),
  sender: z.string().min(1),
  text: z.string(),
  timestamp: z.date(),
  isGroup: z.boolean(),
  participants: z.array(z.string())
});

export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;

// Backend response types
export const BackendResponseSchema = z.object({
  should_respond: z.boolean(),
  reply_text: z.string().optional(),
  reply_bubbles: z.array(z.string()).optional(),
  reflex_message: z.string().optional(),
  burst_messages: z.array(z.string()).optional(),
  burst_delay_ms: z.number().optional()
});

export type BackendResponse = z.infer<typeof BackendResponseSchema>;
```

**File: `src/types/config.types.ts` (NEW)**
```typescript
import { z } from 'zod';

export const ConfigSchema = z.object({
  edge: z.object({
    agent_id: z.string(),
    user_phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone number')
  }),
  backend: z.object({
    url: z.string().url().startsWith('https://'),
    sync_interval_seconds: z.number().min(1).max(300),
    request_timeout_ms: z.number().min(1000).max(120000).optional(),
    max_concurrent_requests: z.number().min(1).max(10).optional()
  }),
  websocket: z.object({
    enabled: z.boolean().optional(),
    reconnect_attempts: z.number().optional(),
    ping_interval_seconds: z.number().optional()
  }).optional(),
  imessage: z.object({
    poll_interval_seconds: z.number().min(0.1).max(60),
    db_path: z.string(),
    enable_fast_check: z.boolean().optional(),
    max_messages_per_poll: z.number().optional()
  }),
  database: z.object({
    path: z.string()
  }),
  scheduler: z.object({
    check_interval_seconds: z.number().optional(),
    adaptive_mode: z.boolean().optional()
  }).optional(),
  performance: z.object({
    profile: z.enum(['balanced', 'low-latency', 'low-resource']).optional(),
    parallel_message_processing: z.boolean().optional(),
    batch_applescript_sends: z.boolean().optional()
  }).optional(),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    file: z.string()
  })
});

export type Config = z.infer<typeof ConfigSchema>;
```

#### Step 3: Fix EdgeAgent Type Safety (2 hours)

**File: `src/index.ts`**

```typescript
// BEFORE (lines 23-24)
private config: any;
private logger: Logger;

// AFTER
import { Config } from './types/config.types';
import { IncomingMessage } from './types/message.types';

private config: Config;
private logger: Logger;

// BEFORE (line 238)
private async processMessage(message: any): Promise<void> {

// AFTER
private async processMessage(message: IncomingMessage): Promise<void> {
  // Validate message at runtime
  try {
    IncomingMessageSchema.parse(message);
  } catch (error) {
    this.logger.error('Invalid message format:', error);
    Sentry.captureException(error, {
      tags: { component: 'message_processing' },
      extra: { message }
    });
    return; // Skip invalid messages
  }
```

#### Step 4: Fix Config Loading (1 hour)

**File: `src/config.ts`**

```typescript
// BEFORE (lines 105-108)
export function loadConfig(configPath: string = './config.yaml'): Config {
  const configFile = fs.readFileSync(configPath, 'utf8');
  const config = yaml.load(configFile) as Config;

// AFTER
import { ConfigSchema, Config } from './types/config.types';

export function loadConfig(configPath: string = './config.yaml'): Config {
  const configFile = fs.readFileSync(configPath, 'utf8');
  const rawConfig = yaml.load(configFile);

  try {
    // Runtime validation with Zod
    const config = ConfigSchema.parse(rawConfig);

    // Apply performance profile defaults (existing logic)
    // ...

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      throw new Error('Invalid configuration. Please check config.yaml');
    }
    throw error;
  }
}
```

#### Step 5: Fix Backend Client Error Types (1 hour)

**File: `src/backend/RailwayClient.ts`**

```typescript
import { AxiosError } from 'axios';

// BEFORE (line 104)
let lastError: any = null;

// AFTER
let lastError: Error | AxiosError | null = null;

// Add type-safe error checking
private isRetryableError(error: Error | AxiosError): boolean {
  if (axios.isAxiosError(error)) {
    return error.code === 'ECONNRESET' ||
           error.code === 'ECONNREFUSED' ||
           error.code === 'ETIMEDOUT';
  }
  return false;
}

private isAuthError(error: Error | AxiosError): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

private isRateLimitError(error: Error | AxiosError): boolean {
  return axios.isAxiosError(error) && error.response?.status === 429;
}
```

### Testing Plan
```bash
# 1. Type checking
npm run build  # Should complete without errors

# 2. Runtime validation
# Test with invalid config
echo "invalid: yaml" > test-config.yaml
npm run dev  # Should show clear validation errors

# 3. Unit tests
npm test -- --grep "type safety"
```

---

## P0-2: Input Validation & Security (8 hours)

### Problem
No input validation on commands allows injection attacks and DoS vectors.

### Security Threats
1. **AppleScript Injection:** Malicious text could execute arbitrary AppleScript
2. **DoS via Large Payloads:** No limits on message length or batch size
3. **Path Traversal:** Unvalidated file paths in config
4. **Command Injection:** Unvalidated thread IDs could be malicious

### Implementation Steps

#### Step 1: Create Validation Schemas (2 hours)

**File: `src/validation/command.validation.ts` (NEW)**
```typescript
import { z } from 'zod';

// Thread ID validation - only allow safe characters
const ThreadIdSchema = z.string()
  .min(1, 'Thread ID required')
  .max(200, 'Thread ID too long')
  .regex(/^[a-zA-Z0-9+@._\-;]+$/, 'Invalid thread ID format');

// Message text validation
const MessageTextSchema = z.string()
  .min(1, 'Message text required')
  .max(5000, 'Message exceeds 5000 character limit')
  .refine(
    (text) => !containsAppleScriptInjection(text),
    'Message contains forbidden characters'
  );

// Helper to detect AppleScript injection
function containsAppleScriptInjection(text: string): boolean {
  const dangerousPatterns = [
    /do shell script/i,
    /tell application/i,
    /activate application/i,
    /system events/i,
    /\brun\b/i,
    /\bexecute\b/i
  ];

  return dangerousPatterns.some(pattern => pattern.test(text));
}

// Command payload schemas
export const SendMessageNowPayloadSchema = z.object({
  thread_id: ThreadIdSchema,
  text: MessageTextSchema,
  bubble_type: z.enum(['reflex', 'burst', 'normal']).optional()
});

export const ScheduleMessagePayloadSchema = z.object({
  thread_id: ThreadIdSchema,
  message_text: MessageTextSchema,
  send_at: z.string()
    .datetime()
    .refine((date) => {
      const sendTime = new Date(date);
      const now = new Date();
      const maxFuture = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
      return sendTime >= now && sendTime <= maxFuture;
    }, 'send_at must be between now and 1 year in future'),
  is_group: z.boolean().optional()
});

export const CancelScheduledPayloadSchema = z.object({
  schedule_id: z.string().uuid('Invalid schedule ID format')
});

export const SetRulePayloadSchema = z.object({
  rule_type: z.enum(['auto_reply', 'forward', 'filter', 'schedule_reply']),
  rule_config: z.object({
    name: z.string().min(1).max(100),
    enabled: z.boolean(),
    conditions: z.array(z.any()).min(1, 'At least one condition required'),
    action: z.object({
      type: z.string().min(1),
      params: z.record(z.any()).optional()
    })
  })
});

export const UpdatePlanPayloadSchema = z.object({
  thread_id: ThreadIdSchema,
  plan_data: z.record(z.any())
});

// Command wrapper schema
export const EdgeCommandSchema = z.object({
  command_id: z.string().uuid('Invalid command ID'),
  command_type: z.enum([
    'send_message_now',
    'schedule_message',
    'cancel_scheduled',
    'set_rule',
    'update_plan'
  ]),
  payload: z.any(), // Will be validated based on command_type
  timestamp: z.string().datetime().optional(),
  priority: z.enum(['normal', 'immediate']).optional()
});

export type ValidatedCommand = z.infer<typeof EdgeCommandSchema>;
```

#### Step 2: Add AppleScript Sanitization (1.5 hours)

**File: `src/transports/AppleScriptSender.ts`**

```typescript
// Add to class
private sanitizeForAppleScript(text: string): string {
  // Escape special characters that could break AppleScript
  return text
    .replace(/\\/g, '\\\\')  // Backslash
    .replace(/"/g, '\\"')     // Double quotes
    .replace(/\n/g, '\\n')    // Newlines
    .replace(/\r/g, '\\r')    // Carriage returns
    .replace(/\t/g, '\\t');   // Tabs
}

private sanitizeThreadId(threadId: string): string {
  // Only allow known-safe characters in thread IDs
  const sanitized = threadId.replace(/[^a-zA-Z0-9+@._\-;]/g, '');

  if (sanitized !== threadId) {
    this.logger.warn(`Thread ID contained unsafe characters: ${threadId}`);
    Sentry.captureMessage('Thread ID sanitization occurred', {
      level: 'warning',
      tags: { component: 'applescript_sender' },
      extra: { original: threadId, sanitized }
    });
  }

  return sanitized;
}

// BEFORE (existing sendMessage method)
async sendMessage(threadId: string, text: string, isGroup: boolean): Promise<boolean> {
  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${threadId}" of targetService
      send "${text}" to targetBuddy
    end tell
  `;

// AFTER
async sendMessage(threadId: string, text: string, isGroup: boolean): Promise<boolean> {
  // Validate and sanitize inputs
  const safeThreadId = this.sanitizeThreadId(threadId);
  const safeText = this.sanitizeForAppleScript(text);

  // Validate message length
  if (safeText.length > 5000) {
    this.logger.error('Message exceeds 5000 character limit');
    throw new Error('Message too long');
  }

  const script = `
    tell application "Messages"
      set targetService to 1st account whose service type = iMessage
      set targetBuddy to participant "${safeThreadId}" of targetService
      send "${safeText}" to targetBuddy
    end tell
  `;

  // Rest of implementation...
}
```

#### Step 3: Add Rate Limiting (2 hours)

**File: `src/utils/RateLimiter.ts` (NEW)**
```typescript
import { ILogger } from '../interfaces/ILogger';

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  identifier: string; // e.g., 'send_message', 'backend_request'
}

export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.logger = logger;
  }

  /**
   * Check if request is allowed under rate limit
   * @returns true if allowed, false if rate limited
   */
  async checkLimit(config: RateLimitConfig): Promise<boolean> {
    const now = Date.now();
    const key = config.identifier;

    // Get existing requests in current window
    let requestTimes = this.requests.get(key) || [];

    // Remove requests outside the window
    requestTimes = requestTimes.filter(time => now - time < config.windowMs);

    // Check if limit exceeded
    if (requestTimes.length >= config.maxRequests) {
      const oldestRequest = Math.min(...requestTimes);
      const retryAfter = Math.ceil((config.windowMs - (now - oldestRequest)) / 1000);

      this.logger.warn(
        `Rate limit exceeded for ${key}: ${requestTimes.length}/${config.maxRequests} in ${config.windowMs}ms`
      );

      return false;
    }

    // Add current request
    requestTimes.push(now);
    this.requests.set(key, requestTimes);

    return true;
  }

  /**
   * Clean up old request data (call periodically)
   */
  cleanup(): void {
    const now = Date.now();
    const maxAge = 60000; // 1 minute

    for (const [key, times] of this.requests.entries()) {
      const filtered = times.filter(time => now - time < maxAge);
      if (filtered.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, filtered);
      }
    }
  }
}
```

**File: `src/transports/AppleScriptSender.ts`** (add rate limiting)
```typescript
import { RateLimiter } from '../utils/RateLimiter';

export class AppleScriptSender {
  private logger: ILogger;
  private rateLimiter: RateLimiter;

  constructor(logger: ILogger) {
    this.logger = logger;
    this.rateLimiter = new RateLimiter(logger);

    // Cleanup rate limiter every minute
    setInterval(() => this.rateLimiter.cleanup(), 60000);
  }

  async sendMessage(threadId: string, text: string, isGroup: boolean): Promise<boolean> {
    // Check rate limit: max 60 messages per minute
    const allowed = await this.rateLimiter.checkLimit({
      maxRequests: 60,
      windowMs: 60000,
      identifier: 'send_message'
    });

    if (!allowed) {
      this.logger.error('Rate limit exceeded for message sending');
      throw new Error('Rate limit exceeded: max 60 messages/minute');
    }

    // Rest of implementation...
  }
}
```

#### Step 4: Update Command Handler with Validation (2.5 hours)

**File: `src/commands/CommandHandler.ts`**

```typescript
import {
  SendMessageNowPayloadSchema,
  ScheduleMessagePayloadSchema,
  CancelScheduledPayloadSchema,
  SetRulePayloadSchema,
  UpdatePlanPayloadSchema,
  EdgeCommandSchema
} from '../validation/command.validation';
import * as Sentry from '@sentry/node';
import { z } from 'zod';

export class CommandHandler {
  // ... existing code

  /**
   * Validate and execute a command from the backend
   */
  async executeCommand(command: EdgeCommandWrapper): Promise<{ success: boolean; error?: string }> {
    try {
      // Step 1: Validate command wrapper structure
      const validatedCommand = EdgeCommandSchema.parse(command);

      this.logger.info(`Executing command ${validatedCommand.command_id}: ${validatedCommand.command_type}`);

      // Step 2: Validate payload based on command type
      let validatedPayload: any;

      try {
        switch (validatedCommand.command_type) {
          case 'send_message_now':
            validatedPayload = SendMessageNowPayloadSchema.parse(validatedCommand.payload);
            return await this.handleSendMessageNow({
              ...validatedCommand,
              payload: validatedPayload
            });

          case 'schedule_message':
            validatedPayload = ScheduleMessagePayloadSchema.parse(validatedCommand.payload);
            return await this.handleScheduleMessage({
              ...validatedCommand,
              payload: validatedPayload
            });

          case 'cancel_scheduled':
            validatedPayload = CancelScheduledPayloadSchema.parse(validatedCommand.payload);
            return await this.handleCancelScheduled({
              ...validatedCommand,
              payload: validatedPayload
            });

          case 'set_rule':
            validatedPayload = SetRulePayloadSchema.parse(validatedCommand.payload);
            return await this.handleSetRule({
              ...validatedCommand,
              payload: validatedPayload
            });

          case 'update_plan':
            validatedPayload = UpdatePlanPayloadSchema.parse(validatedCommand.payload);
            return await this.handleUpdatePlan({
              ...validatedCommand,
              payload: validatedPayload
            });

          default:
            throw new Error(`Unknown command type: ${validatedCommand.command_type}`);
        }
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          const errorMessage = validationError.errors
            .map(e => `${e.path.join('.')}: ${e.message}`)
            .join('; ');

          this.logger.error(`Command payload validation failed: ${errorMessage}`);

          // Report to Sentry
          Sentry.captureException(validationError, {
            tags: {
              component: 'command_handler',
              command_type: validatedCommand.command_type
            },
            extra: {
              command_id: validatedCommand.command_id,
              payload: validatedCommand.payload,
              errors: validationError.errors
            }
          });

          return {
            success: false,
            error: `Invalid payload: ${errorMessage}`
          };
        }
        throw validationError;
      }

    } catch (error: any) {
      // Command wrapper validation failed
      if (error instanceof z.ZodError) {
        const errorMessage = error.errors
          .map(e => `${e.path.join('.')}: ${e.message}`)
          .join('; ');

        this.logger.error(`Command validation failed: ${errorMessage}`);

        Sentry.captureException(error, {
          tags: { component: 'command_handler' },
          extra: { command, errors: error.errors }
        });

        return {
          success: false,
          error: `Invalid command: ${errorMessage}`
        };
      }

      this.logger.error(`Error executing command:`, error.message);

      Sentry.captureException(error, {
        tags: { component: 'command_handler' },
        extra: { command }
      });

      return {
        success: false,
        error: error.message
      };
    }
  }
}
```

### Testing Plan
```bash
# 1. Test AppleScript injection prevention
npm test -- --grep "AppleScript sanitization"

# 2. Test rate limiting
npm test -- --grep "rate limit"

# 3. Test validation schemas
npm test -- --grep "command validation"

# 4. Manual injection tests
# Try sending: tell application "System Events" to activate
# Should be rejected or sanitized
```

---

## P0-3: Fix Memory Leaks (4 hours)

### Problem
1. Unbounded `wsMessagesSent` Map growth
2. Untracked setTimeout/setInterval timers
3. No cleanup on graceful shutdown

### Implementation Steps

#### Step 1: Add Timeout Tracking (1.5 hours)

**File: `src/index.ts`**

```typescript
export class EdgeAgent {
  // ... existing properties

  // NEW: Track all timers for cleanup
  private activeTimers: Set<NodeJS.Timeout> = new Set();
  private activeIntervals: Set<NodeJS.Timeout> = new Set();

  // NEW: Add size limit to wsMessagesSent
  private readonly WS_MESSAGE_TRACKING_MAX_SIZE = 1000;
  private readonly WS_MESSAGE_TRACKING_MAX_AGE_MS = 60000; // 1 minute

  // NEW: Track when messages were added
  private wsMessagesTimestamps: Map<string, Map<string, number>> = new Map();

  /**
   * Safe setTimeout that tracks timer for cleanup
   */
  private safeSetTimeout(callback: () => void, ms: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.activeTimers.delete(timer);
      callback();
    }, ms);

    this.activeTimers.add(timer);
    return timer;
  }

  /**
   * Safe setInterval that tracks timer for cleanup
   */
  private safeSetInterval(callback: () => void, ms: number): NodeJS.Timeout {
    const timer = setInterval(callback, ms);
    this.activeIntervals.add(timer);
    return timer;
  }

  /**
   * Clean up old WebSocket message tracking entries
   */
  private cleanupOldTrackedMessages(): void {
    const now = Date.now();

    for (const [threadId, messages] of this.wsMessagesTimestamps.entries()) {
      for (const [messageText, timestamp] of messages.entries()) {
        if (now - timestamp > this.WS_MESSAGE_TRACKING_MAX_AGE_MS) {
          // Remove from both maps
          this.wsMessagesSent.get(threadId)?.delete(messageText);
          messages.delete(messageText);
        }
      }

      // Clean up empty thread entries
      if (messages.size === 0) {
        this.wsMessagesTimestamps.delete(threadId);
        this.wsMessagesSent.delete(threadId);
      }
    }

    // Size-based eviction (if still too large)
    const totalTracked = Array.from(this.wsMessagesSent.values())
      .reduce((sum, set) => sum + set.size, 0);

    if (totalTracked > this.WS_MESSAGE_TRACKING_MAX_SIZE) {
      this.logger.warn(
        `WebSocket message tracking exceeded max size (${totalTracked}/${this.WS_MESSAGE_TRACKING_MAX_SIZE}), clearing oldest entries`
      );

      // Clear oldest 20% of entries
      const entriesToRemove = Math.ceil(totalTracked * 0.2);
      let removed = 0;

      for (const [threadId, messages] of this.wsMessagesTimestamps.entries()) {
        if (removed >= entriesToRemove) break;

        const sorted = Array.from(messages.entries())
          .sort((a, b) => a[1] - b[1]); // Sort by timestamp

        for (const [messageText] of sorted) {
          if (removed >= entriesToRemove) break;

          this.wsMessagesSent.get(threadId)?.delete(messageText);
          messages.delete(messageText);
          removed++;
        }
      }

      Sentry.captureMessage('WebSocket message tracking size limit reached', {
        level: 'warning',
        extra: { totalTracked, removed }
      });
    }
  }

  /**
   * Start cleanup interval for tracked messages
   */
  private startMemoryCleanup(): void {
    // Clean up every 30 seconds
    this.safeSetInterval(() => {
      this.cleanupOldTrackedMessages();
    }, 30000);
  }
}
```

#### Step 2: Fix Message Tracking (1 hour)

**File: `src/index.ts` (update processCommand method)**

```typescript
// BEFORE (lines 474-492)
if (threadId && messageText) {
  if (!this.wsMessagesSent.has(threadId)) {
    this.wsMessagesSent.set(threadId, new Set());
  }
  this.wsMessagesSent.get(threadId)!.add(messageText);

  // Auto-cleanup after 30 seconds
  setTimeout(() => {
    const messages = this.wsMessagesSent.get(threadId!);
    if (messages) {
      messages.delete(messageText!);
      if (messages.size === 0) {
        this.wsMessagesSent.delete(threadId!);
      }
    }
  }, 30000);
}

// AFTER
if (threadId && messageText) {
  // Initialize tracking structures
  if (!this.wsMessagesSent.has(threadId)) {
    this.wsMessagesSent.set(threadId, new Set());
    this.wsMessagesTimestamps.set(threadId, new Map());
  }

  // Track message with timestamp
  this.wsMessagesSent.get(threadId)!.add(messageText);
  this.wsMessagesTimestamps.get(threadId)!.set(messageText, Date.now());

  this.logger.info(
    `📝 Pre-tracking WebSocket message for ${threadId}: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`
  );

  // Cleanup happens in periodic cleanupOldTrackedMessages() instead of individual timeouts
}
```

#### Step 3: Fix Polling Intervals (1 hour)

**File: `src/index.ts`**

```typescript
// BEFORE
private startPolling(): void {
  const pollIntervalMs = this.config.imessage.poll_interval_seconds * 1000;
  this.pollMessages();
  this.pollInterval = setInterval(() => {
    this.pollMessages();
  }, pollIntervalMs);
}

// AFTER
private startPolling(): void {
  const pollIntervalMs = this.config.imessage.poll_interval_seconds * 1000;
  this.pollMessages();
  this.pollInterval = this.safeSetInterval(() => {
    this.pollMessages();
  }, pollIntervalMs);
}

// BEFORE
private startSyncLoop(): void {
  const syncIntervalMs = this.config.backend.sync_interval_seconds * 1000;
  this.syncWithBackend();
  this.syncInterval = setInterval(() => {
    this.syncWithBackend();
  }, syncIntervalMs);
}

// AFTER
private startSyncLoop(): void {
  const syncIntervalMs = this.config.backend.sync_interval_seconds * 1000;
  this.syncWithBackend();
  this.syncInterval = this.safeSetInterval(() => {
    this.syncWithBackend();
  }, syncIntervalMs);
}
```

#### Step 4: Update Stop Method (30 min)

**File: `src/index.ts`**

```typescript
// BEFORE
stop(): void {
  this.logger.info('Stopping Edge Agent...');
  this.isRunning = false;

  if (this.pollInterval) {
    clearInterval(this.pollInterval);
    this.pollInterval = null;
  }

  if (this.syncInterval) {
    clearInterval(this.syncInterval);
    this.syncInterval = null;
  }

  this.wsClient.disconnect();
  this.scheduler.stop();
  this.transport.stop();

  this.logger.info('✅ Edge Agent stopped');
}

// AFTER
stop(): void {
  this.logger.info('Stopping Edge Agent...');
  this.isRunning = false;

  // Clear all tracked intervals
  this.activeIntervals.forEach(interval => {
    clearInterval(interval);
  });
  this.activeIntervals.clear();

  // Clear all tracked timeouts
  this.activeTimers.forEach(timer => {
    clearTimeout(timer);
  });
  this.activeTimers.clear();

  // Clear WebSocket message tracking
  this.wsMessagesSent.clear();
  this.wsMessagesTimestamps.clear();

  // Disconnect components
  this.wsClient.disconnect();
  this.scheduler.stop();
  this.transport.stop();

  this.logger.info('✅ Edge Agent stopped (cleaned up all timers and tracking)');
}
```

#### Step 5: Start Memory Cleanup (10 min)

**File: `src/index.ts` (add to start method)**

```typescript
async start(): Promise<void> {
  try {
    // ... existing startup code

    // NEW: Start memory cleanup
    this.startMemoryCleanup();

    this.logger.info('='.repeat(60));
    this.logger.info('✅ Edge Agent is running!');
    // ... rest of code
}
```

### Testing Plan
```bash
# 1. Memory leak test
node --expose-gc test-memory-leak.js

# 2. Timer cleanup test
npm test -- --grep "timer cleanup"

# 3. Long-running test (check memory growth over time)
npm run dev &
sleep 3600  # Run for 1 hour
kill $!  # Should clean up gracefully
```

---

## Monitoring: Sentry Integration (4 hours)

### Setup Overview
Sentry will capture errors, performance metrics, and create breadcrumbs for debugging.

### Implementation Steps

#### Step 1: Install Sentry (15 min)

```bash
npm install @sentry/node @sentry/tracing
```

#### Step 2: Create Sentry Initialization (30 min)

**File: `src/monitoring/sentry.ts` (NEW)**

```typescript
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import { Config } from '../types/config.types';

export function initializeSentry(config: Config): void {
  if (!process.env.SENTRY_DSN) {
    console.warn('SENTRY_DSN not set, error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,

    // Environment
    environment: process.env.NODE_ENV || 'production',
    release: `edge-agent@${process.env.npm_package_version || '1.0.0'}`,

    // Performance monitoring
    tracesSampleRate: 1.0, // 100% of transactions
    profilesSampleRate: 0.1, // 10% of transactions for profiling

    // Error filtering
    beforeSend(event, hint) {
      // Don't send certain errors
      const error = hint.originalException;

      if (error instanceof Error) {
        // Ignore expected errors
        if (error.message.includes('ECONNREFUSED') && event.level === 'warning') {
          return null; // Don't send
        }
      }

      // Add custom context
      event.tags = {
        ...event.tags,
        agent_id: config.edge.agent_id,
        user_phone: config.edge.user_phone,
        backend_url: config.backend.url
      };

      return event;
    },

    // Integrations
    integrations: [
      new ProfilingIntegration(),
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.OnUncaughtException(),
      new Sentry.Integrations.OnUnhandledRejection()
    ],

    // Scrub sensitive data
    beforeBreadcrumb(breadcrumb) {
      // Scrub message text from breadcrumbs
      if (breadcrumb.data?.message_text) {
        breadcrumb.data.message_text = '[REDACTED]';
      }
      if (breadcrumb.data?.text) {
        breadcrumb.data.text = '[REDACTED]';
      }
      return breadcrumb;
    }
  });

  // Set user context
  Sentry.setUser({
    id: config.edge.agent_id,
    username: config.edge.user_phone
  });

  console.log('✅ Sentry initialized');
}

// Helper to create transaction spans
export function createSentrySpan(
  operation: string,
  description: string
): Sentry.Span | undefined {
  const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();

  if (transaction) {
    return transaction.startChild({
      op: operation,
      description
    });
  }

  return undefined;
}
```

#### Step 3: Add Sentry to Main App (1 hour)

**File: `src/index.ts`**

```typescript
import * as Sentry from '@sentry/node';
import { initializeSentry, createSentrySpan } from './monitoring/sentry';

class EdgeAgent {
  constructor() {
    this.config = loadConfig();
    validateConfig(this.config);

    // Initialize Sentry FIRST
    initializeSentry(this.config);

    // ... rest of constructor
  }

  async start(): Promise<void> {
    const transaction = Sentry.startTransaction({
      op: 'agent.startup',
      name: 'Edge Agent Startup'
    });

    try {
      this.logger.info('='.repeat(60));
      this.logger.info('Starting Edge Agent v2.0.0');

      // Register with backend
      const registerSpan = transaction.startChild({
        op: 'backend.register',
        description: 'Register with backend'
      });

      const edgeAgentId = await this.backend.register();
      registerSpan.finish();

      Sentry.addBreadcrumb({
        category: 'agent',
        message: 'Registered with backend',
        level: 'info',
        data: { edge_agent_id: edgeAgentId }
      });

      // ... rest of startup

      transaction.finish();
    } catch (error: any) {
      transaction.setStatus('internal_error');
      transaction.finish();

      Sentry.captureException(error, {
        tags: { phase: 'startup' },
        level: 'fatal'
      });

      throw error;
    }
  }

  private async processMessage(message: IncomingMessage): Promise<void> {
    const transaction = Sentry.startTransaction({
      op: 'message.process',
      name: 'Process Incoming Message',
      data: {
        thread_id: message.threadId,
        is_group: message.isGroup
      }
    });

    try {
      Sentry.addBreadcrumb({
        category: 'message',
        message: 'Processing incoming message',
        level: 'info',
        data: {
          thread_id: message.threadId,
          sender: message.sender,
          is_group: message.isGroup
        }
      });

      // Send to backend
      const backendSpan = transaction.startChild({
        op: 'backend.send_message',
        description: 'Send message to backend'
      });

      const startTime = Date.now();
      const response = await this.backend.sendMessage({
        thread_id: message.threadId,
        sender: message.sender,
        filtered_text: message.text,
        original_timestamp: message.timestamp.toISOString(),
        is_group: message.isGroup,
        participants: message.participants,
        was_redacted: false,
        redacted_fields: [],
        filter_reason: 'phase1_transport'
      });

      const duration = Date.now() - startTime;
      backendSpan.setData('duration_ms', duration);
      backendSpan.finish();

      // Track backend latency
      Sentry.metrics.distribution('backend.latency', duration, {
        unit: 'millisecond',
        tags: { endpoint: 'send_message' }
      });

      // ... rest of processing

      transaction.setStatus('ok');
      transaction.finish();

    } catch (error: any) {
      transaction.setStatus('internal_error');
      transaction.finish();

      Sentry.captureException(error, {
        tags: {
          component: 'message_processor',
          thread_id: message.threadId
        },
        extra: { message }
      });

      this.logger.error('Error processing message:', error.message);
    }
  }
}

// Update main() function
async function main() {
  const agent = new EdgeAgent();

  // Handle shutdown gracefully
  process.on('SIGINT', () => {
    console.log('\n\nReceived SIGINT, shutting down gracefully...');
    agent.stop();

    // Flush Sentry events before exit
    Sentry.close(2000).then(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    console.log('\n\nReceived SIGTERM, shutting down gracefully...');
    agent.stop();

    Sentry.close(2000).then(() => {
      process.exit(0);
    });
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);

    Sentry.captureException(error, {
      level: 'fatal',
      tags: { error_type: 'uncaught_exception' }
    });

    agent.stop();

    Sentry.close(2000).then(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);

    Sentry.captureException(error as Error, {
      level: 'error',
      tags: { error_type: 'unhandled_rejection' }
    });

    agent.stop();

    Sentry.close(2000).then(() => {
      process.exit(1);
    });
  });

  // Start the agent
  try {
    await agent.start();
  } catch (error) {
    console.error('Failed to start edge agent:', error);

    Sentry.captureException(error as Error, {
      level: 'fatal',
      tags: { phase: 'startup' }
    });

    await Sentry.close(2000);
    process.exit(1);
  }
}
```

#### Step 4: Add Sentry to Other Components (1.5 hours)

**File: `src/backend/RailwayClient.ts`**

```typescript
import * as Sentry from '@sentry/node';

async sendMessage(request: BackendMessageRequest): Promise<BackendMessageResponse> {
  const span = createSentrySpan('backend.api_call', 'POST /edge/message');

  try {
    // ... existing code

    const response = await this.client.post('/edge/message', request, { headers });
    const duration = Date.now() - startTime;

    // Track metrics
    Sentry.metrics.distribution('backend.request.duration', duration, {
      unit: 'millisecond',
      tags: { endpoint: '/edge/message', status: 'success' }
    });

    Sentry.metrics.increment('backend.request.count', 1, {
      tags: { endpoint: '/edge/message', status: 'success' }
    });

    span?.finish();
    return response.data;

  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Track error metrics
    Sentry.metrics.distribution('backend.request.duration', duration, {
      unit: 'millisecond',
      tags: { endpoint: '/edge/message', status: 'error' }
    });

    Sentry.metrics.increment('backend.request.error', 1, {
      tags: {
        endpoint: '/edge/message',
        error_code: error.code || 'unknown',
        http_status: error.response?.status || 0
      }
    });

    span?.setStatus('internal_error');
    span?.finish();

    throw error;
  }
}
```

**File: `src/scheduler/Scheduler.ts`**

```typescript
import * as Sentry from '@sentry/node';

private async executeSendMessage(message: ScheduledMessage): Promise<void> {
  const span = createSentrySpan('scheduler.send_message', `Send scheduled message ${message.id}`);

  try {
    // Calculate how late/early we are
    const now = new Date();
    const scheduledTime = message.send_at.getTime();
    const actualTime = now.getTime();
    const delayMs = actualTime - scheduledTime;

    // Track scheduler precision
    Sentry.metrics.distribution('scheduler.execution.delay', Math.abs(delayMs), {
      unit: 'millisecond',
      tags: {
        was_late: delayMs > 0 ? 'true' : 'false'
      }
    });

    // ... rest of execution

    Sentry.metrics.increment('scheduler.message.sent', 1, {
      tags: { status: 'success' }
    });

    span?.finish();

  } catch (error: any) {
    Sentry.metrics.increment('scheduler.message.sent', 1, {
      tags: { status: 'failed' }
    });

    Sentry.captureException(error, {
      tags: {
        component: 'scheduler',
        message_id: message.id,
        thread_id: message.thread_id
      },
      extra: { message }
    });

    span?.setStatus('internal_error');
    span?.finish();

    throw error;
  }
}
```

#### Step 5: Update Environment Variables (15 min)

**File: `.env.example`**

```bash
# Authentication
EDGE_SECRET=your_shared_secret_here
REGISTRATION_TOKEN=your_registration_token

# Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
NODE_ENV=production  # or development

# Optional: Backend URL override
BACKEND_URL=https://archety-backend-production.up.railway.app
```

### Testing Plan
```bash
# 1. Test Sentry connection
SENTRY_DSN=your-dsn npm run dev
# Check Sentry dashboard for connection

# 2. Test error capture
# Trigger an error and verify it appears in Sentry

# 3. Test breadcrumbs
# Process a message and check breadcrumb trail in Sentry
```

---

## Analytics: Amplitude Integration (3 hours)

### Setup Overview
Amplitude will track user behavior, feature usage, and system health metrics.

### Implementation Steps

#### Step 1: Install Amplitude (15 min)

```bash
npm install @amplitude/node
```

#### Step 2: Create Amplitude Client (45 min)

**File: `src/monitoring/amplitude.ts` (NEW)**

```typescript
import { track, init, identify, setGroup } from '@amplitude/node';
import { Config } from '../types/config.types';
import { ILogger } from '../interfaces/ILogger';

let isInitialized = false;

export function initializeAmplitude(config: Config, logger: ILogger): void {
  if (!process.env.AMPLITUDE_API_KEY) {
    logger.warn('AMPLITUDE_API_KEY not set, analytics disabled');
    return;
  }

  init(process.env.AMPLITUDE_API_KEY, {
    flushIntervalMillis: 10000, // Flush every 10 seconds
    flushQueueSize: 50, // Or when 50 events queued
    logLevel: process.env.NODE_ENV === 'production' ? 'Error' : 'Warn'
  });

  // Identify the edge agent
  identify(
    {
      user_id: config.edge.agent_id,
      device_id: config.edge.agent_id
    },
    {
      user_phone: config.edge.user_phone,
      backend_url: config.backend.url,
      performance_profile: config.performance?.profile || 'balanced',
      websocket_enabled: config.websocket?.enabled !== false,
      adaptive_scheduler: config.scheduler?.adaptive_mode !== false,
      version: process.env.npm_package_version || '1.0.0',
      platform: 'macos',
      node_version: process.version
    }
  );

  isInitialized = true;
  logger.info('✅ Amplitude initialized');
}

/**
 * Track an event in Amplitude
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, any>,
  userId?: string
): void {
  if (!isInitialized) {
    return; // Silently skip if not initialized
  }

  track({
    event_type: eventName,
    user_id: userId,
    event_properties: properties
  });
}

/**
 * Track message received event
 */
export function trackMessageReceived(
  threadId: string,
  isGroup: boolean,
  sender: string,
  userId: string
): void {
  trackEvent('Message Received', {
    thread_id: threadId,
    is_group: isGroup,
    sender_type: sender.includes('@') ? 'email' : 'phone'
  }, userId);
}

/**
 * Track message sent event
 */
export function trackMessageSent(
  threadId: string,
  isGroup: boolean,
  messageType: 'reflex' | 'burst' | 'scheduled' | 'normal',
  latencyMs: number,
  userId: string
): void {
  trackEvent('Message Sent', {
    thread_id: threadId,
    is_group: isGroup,
    message_type: messageType,
    latency_ms: latencyMs
  }, userId);
}

/**
 * Track backend request
 */
export function trackBackendRequest(
  endpoint: string,
  durationMs: number,
  status: 'success' | 'error',
  errorCode?: string,
  userId?: string
): void {
  trackEvent('Backend Request', {
    endpoint,
    duration_ms: durationMs,
    status,
    error_code: errorCode
  }, userId);
}

/**
 * Track WebSocket event
 */
export function trackWebSocketEvent(
  eventType: 'connected' | 'disconnected' | 'reconnect_attempt' | 'command_received',
  metadata?: Record<string, any>,
  userId?: string
): void {
  trackEvent('WebSocket Event', {
    event_type: eventType,
    ...metadata
  }, userId);
}

/**
 * Track command execution
 */
export function trackCommandExecution(
  commandType: string,
  success: boolean,
  durationMs: number,
  error?: string,
  userId?: string
): void {
  trackEvent('Command Executed', {
    command_type: commandType,
    success,
    duration_ms: durationMs,
    error
  }, userId);
}

/**
 * Track scheduler event
 */
export function trackSchedulerEvent(
  eventType: 'message_scheduled' | 'message_sent' | 'message_cancelled' | 'message_failed',
  messageId: string,
  delayMs?: number,
  userId?: string
): void {
  trackEvent('Scheduler Event', {
    event_type: eventType,
    message_id: messageId,
    execution_delay_ms: delayMs
  }, userId);
}

/**
 * Track agent lifecycle event
 */
export function trackAgentLifecycle(
  event: 'started' | 'stopped' | 'crashed',
  uptimeSeconds?: number,
  userId?: string
): void {
  trackEvent('Agent Lifecycle', {
    lifecycle_event: event,
    uptime_seconds: uptimeSeconds
  }, userId);
}

/**
 * Track performance metric
 */
export function trackPerformance(
  metric: string,
  value: number,
  unit: string,
  userId?: string
): void {
  trackEvent('Performance Metric', {
    metric_name: metric,
    metric_value: value,
    metric_unit: unit
  }, userId);
}
```

#### Step 3: Integrate Amplitude into EdgeAgent (1.5 hours)

**File: `src/index.ts`**

```typescript
import {
  initializeAmplitude,
  trackAgentLifecycle,
  trackMessageReceived,
  trackMessageSent,
  trackBackendRequest,
  trackWebSocketEvent,
  trackCommandExecution,
  trackPerformance
} from './monitoring/amplitude';

class EdgeAgent {
  constructor() {
    // ... existing code

    // Initialize Sentry and Amplitude
    initializeSentry(this.config);
    initializeAmplitude(this.config, this.logger);
  }

  async start(): Promise<void> {
    try {
      // ... existing startup code

      // Track agent started
      trackAgentLifecycle('started', 0, this.config.edge.agent_id);

      // ... rest of startup
    } catch (error: any) {
      trackAgentLifecycle('crashed', 0, this.config.edge.agent_id);
      throw error;
    }
  }

  private async processMessage(message: IncomingMessage): Promise<void> {
    try {
      // Track message received
      trackMessageReceived(
        message.threadId,
        message.isGroup,
        message.sender,
        this.config.edge.agent_id
      );

      // Send to backend
      const startTime = Date.now();
      const response = await this.backend.sendMessage({...});
      const backendDuration = Date.now() - startTime;

      // Track backend request
      trackBackendRequest(
        '/edge/message',
        backendDuration,
        'success',
        undefined,
        this.config.edge.agent_id
      );

      // Track performance
      trackPerformance(
        'backend_latency',
        backendDuration,
        'milliseconds',
        this.config.edge.agent_id
      );

      // Track message sent
      if (response.should_respond) {
        if (response.reflex_message) {
          const reflexStart = Date.now();
          const sent = await this.transport.sendMessage(...);
          const reflexDuration = Date.now() - reflexStart;

          if (sent) {
            trackMessageSent(
              message.threadId,
              message.isGroup,
              'reflex',
              reflexDuration,
              this.config.edge.agent_id
            );

            trackPerformance(
              'reflex_send_latency',
              reflexDuration,
              'milliseconds',
              this.config.edge.agent_id
            );
          }
        }
      }

    } catch (error: any) {
      const duration = Date.now() - startTime;
      trackBackendRequest(
        '/edge/message',
        duration,
        'error',
        error.code,
        this.config.edge.agent_id
      );

      this.logger.error('Error processing message:', error.message);
    }
  }

  private async processCommand(command: any): Promise<void> {
    const startTime = Date.now();

    try {
      const result = await this.commandHandler.executeCommand(command);
      const duration = Date.now() - startTime;

      trackCommandExecution(
        command.command_type,
        result.success,
        duration,
        result.error,
        this.config.edge.agent_id
      );

      // ... rest of code
    } catch (error: any) {
      const duration = Date.now() - startTime;

      trackCommandExecution(
        command.command_type,
        false,
        duration,
        error.message,
        this.config.edge.agent_id
      );

      throw error;
    }
  }

  stop(): void {
    const uptimeSeconds = Math.floor((new Date().getTime() - this.startTime.getTime()) / 1000);

    trackAgentLifecycle('stopped', uptimeSeconds, this.config.edge.agent_id);

    // ... existing cleanup code
  }
}
```

#### Step 4: Add WebSocket Analytics (30 min)

**File: `src/backend/WebSocketClient.ts`**

```typescript
import { trackWebSocketEvent } from '../monitoring/amplitude';

export class WebSocketClient {
  private handleOpen(): void {
    this.logger.info('✅ WebSocket connected');
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;

    // Track connection
    trackWebSocketEvent('connected', {
      reconnect_attempts: this.reconnectAttempts
    }, this.edgeAgentId || undefined);

    // ... rest of code
  }

  private handleClose(code: number, reason: Buffer): void {
    const reasonStr = reason.toString() || 'Unknown';
    this.logger.warn(`WebSocket closed: code=${code}, reason=${reasonStr}`);

    // Track disconnection
    trackWebSocketEvent('disconnected', {
      code,
      reason: reasonStr
    }, this.edgeAgentId || undefined);

    // ... rest of code
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);

    // Track reconnect attempt
    trackWebSocketEvent('reconnect_attempt', {
      attempt: this.reconnectAttempts,
      delay_ms: delay
    }, this.edgeAgentId || undefined);

    // ... rest of code
  }

  private async handleCommandMessage(command: EdgeCommandWrapper): Promise<void> {
    // Track command received via WebSocket
    trackWebSocketEvent('command_received', {
      command_type: command.command_type,
      priority: command.priority
    }, this.edgeAgentId || undefined);

    // ... rest of code
  }
}
```

#### Step 5: Update Environment Variables (15 min)

**File: `.env.example`**

```bash
# Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
AMPLITUDE_API_KEY=your-amplitude-api-key
NODE_ENV=production
```

### Testing Plan
```bash
# 1. Test Amplitude connection
AMPLITUDE_API_KEY=your-key npm run dev
# Check Amplitude dashboard for events

# 2. Test event tracking
# Process a message and verify events appear in Amplitude

# 3. Test user identification
# Check that user_id matches edge_agent_id in Amplitude
```

---

## Health Check Endpoint (1 hour)

### Implementation

**File: `src/monitoring/health.ts` (NEW)**

```typescript
import express from 'express';
import { ILogger } from '../interfaces/ILogger';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime_seconds: number;
  components: {
    websocket: {
      connected: boolean;
      reconnect_attempts: number;
    };
    backend: {
      last_successful_request?: string;
      last_error?: string;
    };
    scheduler: {
      pending_messages: number;
      last_execution?: string;
    };
    transport: {
      status: string;
    };
  };
  metrics?: {
    messages_received_total: number;
    messages_sent_total: number;
    errors_total: number;
  };
}

export function createHealthCheckServer(
  port: number,
  getHealthStatus: () => HealthStatus,
  logger: ILogger
): express.Express {
  const app = express();

  app.get('/health', (req, res) => {
    const health = getHealthStatus();

    const statusCode = health.status === 'healthy' ? 200 :
                       health.status === 'degraded' ? 200 :
                       503;

    res.status(statusCode).json(health);
  });

  app.get('/health/live', (req, res) => {
    // Liveness probe - just check if process is running
    res.status(200).json({ status: 'alive' });
  });

  app.get('/health/ready', (req, res) => {
    // Readiness probe - check if ready to serve traffic
    const health = getHealthStatus();
    const isReady = health.status !== 'unhealthy';

    res.status(isReady ? 200 : 503).json({
      ready: isReady,
      components: health.components
    });
  });

  app.listen(port, () => {
    logger.info(`Health check server listening on port ${port}`);
  });

  return app;
}
```

**File: `src/index.ts` (add health check)**

```typescript
import { createHealthCheckServer, HealthStatus } from './monitoring/health';

class EdgeAgent {
  private healthServer?: express.Express;
  private metricsCounters = {
    messagesReceived: 0,
    messagesSent: 0,
    errorsTotal: 0
  };
  private lastBackendSuccess?: Date;
  private lastBackendError?: string;
  private lastSchedulerExecution?: Date;

  async start(): Promise<void> {
    // ... existing startup code

    // Start health check server
    const healthPort = parseInt(process.env.HEALTH_CHECK_PORT || '3001');
    this.healthServer = createHealthCheckServer(
      healthPort,
      () => this.getHealthStatus(),
      this.logger
    );

    this.logger.info(`Health check available at http://localhost:${healthPort}/health`);
  }

  private getHealthStatus(): HealthStatus {
    const uptime = Math.floor((Date.now() - this.startTime.getTime()) / 1000);

    return {
      status: this.determineOverallHealth(),
      timestamp: new Date().toISOString(),
      uptime_seconds: uptime,
      components: {
        websocket: {
          connected: this.wsClient.isConnected(),
          reconnect_attempts: this.wsClient.getStatus().reconnectAttempts
        },
        backend: {
          last_successful_request: this.lastBackendSuccess?.toISOString(),
          last_error: this.lastBackendError
        },
        scheduler: {
          pending_messages: this.scheduler.getStats().pending,
          last_execution: this.lastSchedulerExecution?.toISOString()
        },
        transport: {
          status: this.isRunning ? 'running' : 'stopped'
        }
      },
      metrics: {
        messages_received_total: this.metricsCounters.messagesReceived,
        messages_sent_total: this.metricsCounters.messagesSent,
        errors_total: this.metricsCounters.errorsTotal
      }
    };
  }

  private determineOverallHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    if (!this.isRunning) {
      return 'unhealthy';
    }

    // Check if backend is reachable
    const timeSinceLastSuccess = this.lastBackendSuccess ?
      Date.now() - this.lastBackendSuccess.getTime() : Infinity;

    if (timeSinceLastSuccess > 300000) { // 5 minutes
      return 'unhealthy';
    }

    // Check WebSocket
    if (!this.wsClient.isConnected() && this.wsClient.getStatus().reconnectAttempts > 5) {
      return 'degraded';
    }

    return 'healthy';
  }
}
```

---

## Alerting Setup (2 hours)

### Sentry Alerts

**Setup in Sentry Dashboard:**

1. **High Error Rate Alert**
   - Condition: More than 10 errors in 1 hour
   - Action: Email team + Slack notification
   - Priority: High

2. **Backend Connection Failure**
   - Condition: Error contains "ECONNREFUSED" or "ETIMEDOUT"
   - Frequency: More than 5 in 5 minutes
   - Action: Page on-call engineer
   - Priority: Critical

3. **Uncaught Exception**
   - Condition: Error tag = "uncaught_exception"
   - Frequency: Any occurrence
   - Action: Immediate Slack alert
   - Priority: Critical

4. **Memory Leak Detection**
   - Condition: Performance metric "memory_usage_mb" > 500MB
   - Frequency: Sustained for 5 minutes
   - Action: Email ops team
   - Priority: Medium

5. **WebSocket Reconnect Loop**
   - Condition: Event "WebSocket Event" with reconnect_attempts > 10
   - Frequency: Any occurrence
   - Action: Slack notification
   - Priority: Medium

### Amplitude Alerts

**Setup in Amplitude Dashboard:**

1. **Message Processing Failure Rate**
   - Metric: "Message Sent" event where success=false
   - Threshold: > 5% failure rate over 1 hour
   - Action: Email team

2. **Backend Latency Spike**
   - Metric: "Backend Request" duration_ms
   - Threshold: P95 > 5000ms for 10 minutes
   - Action: Slack notification

3. **Agent Crash**
   - Event: "Agent Lifecycle" where event=crashed
   - Threshold: Any occurrence
   - Action: Immediate alert

4. **Zero Activity**
   - Metric: "Message Received" events
   - Threshold: 0 events for 1 hour (during business hours)
   - Action: Email notification

### Infrastructure Monitoring (Railway)

**File: `docs/MONITORING_SETUP.md` (NEW)**

````markdown
# Monitoring & Alerting Setup

## Sentry Setup

1. Create Sentry project: https://sentry.io/organizations/archety/projects/
2. Copy DSN to `.env`:
   ```bash
   SENTRY_DSN=https://xxx@sentry.io/xxx
   ```
3. Configure alerts in Sentry dashboard (see P0_IMPLEMENTATION_PLAN.md)

## Amplitude Setup

1. Create Amplitude project: https://analytics.amplitude.com/
2. Copy API key to `.env`:
   ```bash
   AMPLITUDE_API_KEY=xxx
   ```
3. Configure charts and alerts in Amplitude dashboard

## Health Checks

The agent exposes health check endpoints on port 3001:

- `GET /health` - Full health status
- `GET /health/live` - Liveness probe (Kubernetes)
- `GET /health/ready` - Readiness probe (Kubernetes)

### Monitoring Health Checks

```bash
# Local testing
curl http://localhost:3001/health

# Production monitoring (add to uptime monitor)
curl https://edge-agent.yourdomain.com/health
```

## Alert Escalation Policy

1. **P0 (Critical)** - Page on-call immediately
   - Uncaught exceptions
   - Backend unreachable >5 min
   - Agent crashes

2. **P1 (High)** - Slack + Email within 15 min
   - High error rate (>10/hour)
   - WebSocket disconnected >10 min
   - Memory usage >500MB

3. **P2 (Medium)** - Email within 1 hour
   - WebSocket reconnect loop
   - Backend latency >5s
   - Message failure rate >5%

4. **P3 (Low)** - Daily summary email
   - Performance degradation
   - Non-critical warnings
````

---

## Implementation Checklist

### Week 1 (Days 1-2): P0 Fixes
- [ ] Install dependencies (zod, sentry, amplitude)
- [ ] Create type definitions and schemas
- [ ] Fix all `any` types in codebase
- [ ] Add runtime validation with Zod
- [ ] Add AppleScript sanitization
- [ ] Implement rate limiting
- [ ] Add command validation
- [ ] Test type safety fixes

### Week 1 (Days 3-4): Memory & Monitoring
- [ ] Implement timer tracking
- [ ] Fix WebSocket message tracking memory leak
- [ ] Update stop() method with cleanup
- [ ] Initialize Sentry
- [ ] Add Sentry to all components
- [ ] Test error capture in Sentry
- [ ] Initialize Amplitude
- [ ] Add event tracking throughout app
- [ ] Test analytics in Amplitude

### Week 2 (Day 5): Health Checks & Alerts
- [ ] Create health check endpoint
- [ ] Add metrics tracking
- [ ] Configure Sentry alerts
- [ ] Configure Amplitude alerts
- [ ] Document monitoring setup
- [ ] Test alert notifications
- [ ] Update deployment scripts

### Testing & Validation
- [ ] Run full test suite
- [ ] Manual testing of all P0 fixes
- [ ] Load testing (simulate high volume)
- [ ] Memory leak testing (long-running)
- [ ] Verify Sentry captures errors
- [ ] Verify Amplitude tracks events
- [ ] Test health check endpoints
- [ ] Test alert notifications

---

## Success Metrics

After implementation, monitor these metrics:

1. **Zero Type Errors**
   - `npm run build` completes without warnings
   - No runtime type errors in Sentry

2. **Memory Stability**
   - Memory usage stays <200MB over 24 hours
   - No memory leaks detected

3. **Security**
   - Zero injection attacks successful
   - Rate limiting prevents abuse

4. **Observability**
   - 100% of errors captured in Sentry
   - All user actions tracked in Amplitude
   - Health check endpoint returns accurate status

5. **Alerting**
   - Critical alerts trigger within 1 minute
   - Zero false positives in first week

---

## Rollback Plan

If issues occur during implementation:

1. **Revert to previous version:**
   ```bash
   git revert <commit-hash>
   npm run build
   ./edge-agent.sh restart
   ```

2. **Disable monitoring temporarily:**
   ```bash
   unset SENTRY_DSN
   unset AMPLITUDE_API_KEY
   ./edge-agent.sh restart
   ```

3. **Emergency hotfix process:**
   - Fix critical bug in new branch
   - Fast-track review
   - Deploy directly to production
   - Post-mortem within 24 hours

---

## Post-Implementation Tasks

1. **Documentation**
   - Update README with monitoring info
   - Create runbook for common issues
   - Document alert response procedures

2. **Training**
   - Train team on Sentry dashboard
   - Train team on Amplitude analytics
   - Review alert escalation policy

3. **Optimization**
   - Review Sentry error patterns
   - Optimize Amplitude event schema
   - Fine-tune alert thresholds

4. **Continuous Improvement**
   - Weekly review of error trends
   - Monthly dashboard review
   - Quarterly security audit
