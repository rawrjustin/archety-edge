# Mac Mini Edge Agent - Complete Implementation Guide

**For:** Engineer 1 (Edge Agent Implementation)
**Backend Engineer:** Engineer 2
**Last Updated:** November 1, 2025
**Status:** Ready for Implementation

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Technology Stack Recommendations](#technology-stack-recommendations)
4. [Phase 1: Core Infrastructure](#phase-1-core-infrastructure)
5. [Phase 2: Message Filtering & Privacy](#phase-2-message-filtering--privacy)
6. [Phase 3: Local Scheduling](#phase-3-local-scheduling)
7. [Phase 4: Rule Engine](#phase-4-rule-engine)
8. [Testing Strategy](#testing-strategy)
9. [Deployment & Operations](#deployment--operations)
10. [Security Considerations](#security-considerations)
11. [Code Examples](#code-examples)

---

## Overview

You are building an intelligent edge agent that runs on a Mac mini and serves as the bridge between users' iMessage conversations and our cloud backend. This is **not** just a relay - it's a stateful, intelligent system that handles privacy, scheduling, and execution locally.

### Your Responsibilities

1. **iMessage Integration** - Read/write messages via AppleScript or private Messages DB
2. **Privacy Filter** - Redact PII and filter messages before sending to cloud
3. **Local Scheduler** - Execute scheduled messages without cloud dependency
4. **Rule Engine** - Execute recurring actions (reminders, automations)
5. **Sync Protocol** - Maintain bidirectional communication with backend

### Backend API Endpoints You'll Use

**Base URL:** `https://archety-backend.onrender.com` (production)
**Base URL:** `http://localhost:8000` (development)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/edge/register` | POST | Initial edge agent registration |
| `/edge/sync` | POST | Main sync loop (pull commands, send events) |
| `/edge/message` | POST | Send filtered messages for processing |
| `/edge/command/ack` | POST | Acknowledge command receipt/completion |
| `/edge/health` | GET | Health check |

---

## Architecture

```
┌─────────────────────────────────────────────┐
│           USER'S iPHONE                     │
│         (iMessage client)                   │
└──────────────┬──────────────────────────────┘
               │
               │ iMessage Protocol
               ▼
┌─────────────────────────────────────────────┐
│         MAC MINI EDGE AGENT                 │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  iMessage Monitor                    │  │
│  │  - AppleScript or Messages DB poll  │  │
│  │  - Read incoming messages           │  │
│  │  - Send outgoing messages           │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  Privacy Filter                      │  │
│  │  - Redact PII (phone, address, etc) │  │
│  │  - Extract planning/logistics only   │  │
│  │  - Drop casual chat                  │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  Local Database (SQLite)             │  │
│  │  - Scheduled messages                │  │
│  │  - Rules                             │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  Scheduler                           │  │
│  │  - Executes messages at send_at time│  │
│  │  - 30 second check loop              │  │
│  └──────────────────────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐  │
│  │  Sync Client                         │  │
│  │  - 60s sync loop with backend       │  │
│  │  - Send events, pull commands       │  │
│  └──────────────────────────────────────┘  │
└──────────────┬──────────────────────────────┘
               │
               │ HTTPS (TLS 1.3)
               ▼
┌─────────────────────────────────────────────┐
│         BACKEND ORCHESTRATOR                │
│      (Python FastAPI on Render)             │
└─────────────────────────────────────────────┘
```

---

## Technology Stack Recommendations

### Option 1: Node.js + AppleScript (Recommended for MVP)

**Pros:**
- Fast development
- Good libraries for HTTP/scheduling
- Easy AppleScript bridge

**Cons:**
- AppleScript is slower
- Limited access to private APIs

**Stack:**
```
- Node.js 18+
- TypeScript
- SQLite (better-sqlite3)
- node-cron for scheduling
- axios for HTTP
- osascript for AppleScript
```

### Option 2: Swift + Private APIs (Production Quality)

**Pros:**
- Direct access to Messages framework
- Better performance
- Native macOS integration

**Cons:**
- Steeper learning curve
- More code to write
- Need to handle SIP/entitlements

**Stack:**
```
- Swift 5.9+
- SQLite.swift
- URLSession for HTTP
- Timer/DispatchQueue for scheduling
- IMDatabaseReader (private)
```

### Recommendation

**Start with Node.js for MVP** (2-3 weeks), then migrate to Swift for production (2-3 weeks).

---

## Phase 1: Core Infrastructure

### 1.1 Project Setup

```bash
mkdir edge-agent
cd edge-agent
npm init -y
npm install typescript @types/node axios better-sqlite3 node-cron dotenv

# Create project structure
mkdir -p src/{iMessage,filter,scheduler,sync,database,utils}
```

**Directory Structure:**
```
edge-agent/
├── src/
│   ├── index.ts                 # Main entry point
│   ├── config.ts                # Configuration
│   ├── iMessage/
│   │   ├── monitor.ts           # Poll for messages
│   │   └── sender.ts            # Send messages
│   ├── filter/
│   │   ├── pii-redactor.ts      # Redact sensitive data
│   │   └── relevance-filter.ts  # Filter for planning/logistics
│   ├── scheduler/
│   │   ├── scheduler.ts         # Main scheduler
│   │   └── executor.ts          # Execute scheduled messages
│   ├── sync/
│   │   ├── client.ts            # Sync with backend
│   │   └── auth.ts              # Authentication
│   ├── database/
│   │   ├── db.ts                # SQLite setup
│   │   └── models.ts            # Data models
│   └── utils/
│       └── logger.ts            # Logging
├── config.yaml                  # Configuration file
└── package.json
```

### 1.2 Configuration

**config.yaml:**
```yaml
edge:
  agent_id: "edge_15551234567"  # Generated: edge_{phone_without_plus}
  user_phone: "+15551234567"    # Your user's phone

backend:
  url: "https://archety-backend.onrender.com"
  sync_interval_seconds: 60

iMessage:
  poll_interval_seconds: 5
  db_path: "~/Library/Messages/chat.db"

filtering:
  enable_pii_redaction: true
  keywords:
    pass: ["sage", "echo", "remind", "schedule", "plan", "what time", "when are we"]
    block: ["password", "ssn", "credit card"]

  redaction:
    phone: "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b"
    email: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"
    address: "\\b\\d+\\s+[\\w\\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd)\\b"

scheduler:
  check_interval_seconds: 30

database:
  path: "./edge-agent.db"
```

### 1.3 Authentication Setup

**src/sync/auth.ts:**
```typescript
import crypto from 'crypto';
import axios from 'axios';

export class EdgeAuth {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    private backendUrl: string,
    private userPhone: string
  ) {}

  async register(): Promise<string> {
    // Step 1: Get registration token (you'll provide this manually)
    const registrationToken = process.env.REGISTRATION_TOKEN || "edge_manual_token";

    // Step 2: Register with backend
    const response = await axios.post(`${this.backendUrl}/edge/register`, {
      user_phone: this.userPhone,
      apple_id: null, // Optional
      version: "1.0.0",
      capabilities: ["schedule", "filter", "rules"],
      auth_token: registrationToken
    });

    const { edge_agent_id } = response.data;

    // Step 3: Generate authentication token
    await this.refreshToken(edge_agent_id);

    return edge_agent_id;
  }

  private async refreshToken(edgeAgentId: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);
    const tokenData = `${edgeAgentId}:${this.userPhone}:${timestamp}`;

    // HMAC signature
    const secret = process.env.EDGE_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION";
    const signature = crypto
      .createHmac('sha256', secret)
      .update(tokenData)
      .digest('hex');

    const token = `${tokenData}:${signature}`;
    this.token = Buffer.from(token).toString('base64');
    this.tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  }

  async getToken(): Promise<string> {
    if (!this.token || !this.tokenExpiry || this.tokenExpiry < new Date()) {
      throw new Error("Token expired, need to re-register");
    }
    return this.token;
  }

  getAuthHeaders(): Record<string, string> {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      'X-Edge-Protocol-Version': '1.0',
      'X-Edge-Timestamp': Math.floor(Date.now() / 1000).toString()
    };
  }
}
```

### 1.4 Database Setup

**src/database/db.ts:**
```typescript
import Database from 'better-sqlite3';
import path from 'path';

export class EdgeDatabase {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.initialize();
  }

  private initialize() {
    // Scheduled messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL,
        message_text TEXT NOT NULL,
        send_at INTEGER NOT NULL,
        is_group INTEGER DEFAULT 0,
        status TEXT DEFAULT 'pending',
        command_id TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
      CREATE INDEX IF NOT EXISTS idx_send_at
        ON scheduled_messages(send_at)
        WHERE status = 'pending';
    `);

    // Rules table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rules (
        id TEXT PRIMARY KEY,
        trigger_type TEXT NOT NULL,
        trigger_config TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_config TEXT NOT NULL,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    // Sync state table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);
  }

  // Scheduled messages
  addScheduledMessage(msg: {
    id: string;
    threadId: string;
    messageText: string;
    sendAt: Date;
    isGroup: boolean;
    commandId?: string;
  }) {
    const stmt = this.db.prepare(`
      INSERT INTO scheduled_messages (id, thread_id, message_text, send_at, is_group, command_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      msg.id,
      msg.threadId,
      msg.messageText,
      Math.floor(msg.sendAt.getTime() / 1000),
      msg.isGroup ? 1 : 0,
      msg.commandId || null
    );
  }

  getPendingMessages(): Array<{
    id: string;
    threadId: string;
    messageText: string;
    sendAt: Date;
    isGroup: boolean;
    commandId: string | null;
  }> {
    const now = Math.floor(Date.now() / 1000);
    const stmt = this.db.prepare(`
      SELECT * FROM scheduled_messages
      WHERE send_at <= ? AND status = 'pending'
      ORDER BY send_at ASC
    `);

    return stmt.all(now).map((row: any) => ({
      id: row.id,
      threadId: row.thread_id,
      messageText: row.message_text,
      sendAt: new Date(row.send_at * 1000),
      isGroup: row.is_group === 1,
      commandId: row.command_id
    }));
  }

  markMessageSent(id: string) {
    const stmt = this.db.prepare(`
      UPDATE scheduled_messages
      SET status = 'sent'
      WHERE id = ?
    `);
    stmt.run(id);
  }

  close() {
    this.db.close();
  }
}
```

---

## Phase 2: Message Filtering & Privacy

### 2.1 iMessage Integration

**src/iMessage/monitor.ts:**
```typescript
import { execSync } from 'child_process';

export interface IncomingMessage {
  threadId: string;
  sender: string;
  text: string;
  timestamp: Date;
  isGroup: boolean;
  participants: string[];
}

export class iMessageMonitor {
  private lastMessageId: number = 0;

  constructor(private messagesDbPath: string) {
    this.loadLastMessageId();
  }

  private loadLastMessageId() {
    try {
      // Query Messages database for latest message ID
      const query = `
        sqlite3 "${this.messagesDbPath}" "SELECT MAX(ROWID) FROM message;"
      `;
      const result = execSync(query, { encoding: 'utf-8' }).trim();
      this.lastMessageId = parseInt(result) || 0;
    } catch (error) {
      console.error('Failed to load last message ID:', error);
    }
  }

  async pollNewMessages(): Promise<IncomingMessage[]> {
    try {
      // Query for new messages since last check
      const query = `
        sqlite3 -json "${this.messagesDbPath}" "
          SELECT
            m.ROWID as id,
            m.text,
            m.date,
            m.is_from_me,
            c.chat_identifier as thread_id,
            h.id as sender
          FROM message m
          JOIN chat_message_join cmj ON m.ROWID = cmj.message_id
          JOIN chat c ON cmj.chat_id = c.ROWID
          LEFT JOIN handle h ON m.handle_id = h.ROWID
          WHERE m.ROWID > ${this.lastMessageId}
            AND m.is_from_me = 0
          ORDER BY m.ROWID ASC;
        "
      `;

      const result = execSync(query, { encoding: 'utf-8' }).trim();
      if (!result) return [];

      const rows = JSON.parse(result);
      const messages: IncomingMessage[] = [];

      for (const row of rows) {
        // Update last message ID
        if (row.id > this.lastMessageId) {
          this.lastMessageId = row.id;
        }

        // Parse message
        const isGroup = row.thread_id.includes(';-;');
        messages.push({
          threadId: row.thread_id,
          sender: row.sender || 'unknown',
          text: row.text || '',
          timestamp: new Date(row.date / 1000000 + 978307200000), // Apple epoch
          isGroup,
          participants: [] // TODO: Query for group participants
        });
      }

      return messages;
    } catch (error) {
      console.error('Failed to poll messages:', error);
      return [];
    }
  }
}
```

**src/iMessage/sender.ts:**
```typescript
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class iMessageSender {
  async sendMessage(threadId: string, text: string, isGroup: boolean): Promise<boolean> {
    try {
      // Escape text for AppleScript
      const escapedText = text.replace(/"/g, '\\"');

      let script: string;

      if (isGroup) {
        // For group chats, use chat ID
        script = `
          tell application "Messages"
            set targetChat to first chat whose id is "${threadId}"
            send "${escapedText}" to targetChat
          end tell
        `;
      } else {
        // For 1:1, extract buddy from thread ID
        const buddy = this.extractBuddyFromThreadId(threadId);
        script = `
          tell application "Messages"
            set targetBuddy to buddy "${buddy}"
            send "${escapedText}" to targetBuddy
          end tell
        `;
      }

      await execAsync(`osascript -e '${script}'`);
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  private extractBuddyFromThreadId(threadId: string): string {
    // Thread ID format: "iMessage;-;+15551234567"
    const parts = threadId.split(';-;');
    return parts[1] || threadId;
  }
}
```

### 2.2 PII Redaction

**src/filter/pii-redactor.ts:**
```typescript
export class PIIRedactor {
  private patterns: Map<string, RegExp>;

  constructor(config: { [key: string]: string }) {
    this.patterns = new Map();

    for (const [name, pattern] of Object.entries(config)) {
      this.patterns.set(name, new RegExp(pattern, 'gi'));
    }
  }

  redact(text: string): { redacted: string; fields: string[] } {
    let redacted = text;
    const redactedFields: string[] = [];

    for (const [fieldName, pattern] of this.patterns) {
      if (pattern.test(redacted)) {
        redacted = redacted.replace(pattern, `[${fieldName.toUpperCase()}]`);
        redactedFields.push(fieldName);
      }
    }

    return { redacted, fields: redactedFields };
  }
}
```

### 2.3 Relevance Filter

**src/filter/relevance-filter.ts:**
```typescript
export interface FilterResult {
  shouldSendToBackend: boolean;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

export class RelevanceFilter {
  private passKeywords: string[];
  private blockKeywords: string[];

  constructor(passKeywords: string[], blockKeywords: string[]) {
    this.passKeywords = passKeywords.map(k => k.toLowerCase());
    this.blockKeywords = blockKeywords.map(k => k.toLowerCase());
  }

  filter(text: string, isGroup: boolean): FilterResult {
    const lowerText = text.toLowerCase();

    // Always pass direct mentions
    if (lowerText.includes('sage') || lowerText.includes('echo')) {
      return {
        shouldSendToBackend: true,
        reason: 'direct_mention',
        priority: 'high'
      };
    }

    // Block sensitive content
    for (const keyword of this.blockKeywords) {
      if (lowerText.includes(keyword)) {
        return {
          shouldSendToBackend: false,
          reason: 'blocked_keyword',
          priority: 'low'
        };
      }
    }

    // Check for planning/logistics keywords
    let matchedKeywords = 0;
    for (const keyword of this.passKeywords) {
      if (lowerText.includes(keyword)) {
        matchedKeywords++;
      }
    }

    if (matchedKeywords > 0) {
      return {
        shouldSendToBackend: true,
        reason: 'planning_request',
        priority: matchedKeywords > 1 ? 'high' : 'medium'
      };
    }

    // For group chats, be more conservative
    if (isGroup) {
      return {
        shouldSendToBackend: false,
        reason: 'casual_group_chat',
        priority: 'low'
      };
    }

    // For 1:1, allow more through
    return {
      shouldSendToBackend: true,
      reason: 'direct_conversation',
      priority: 'medium'
    };
  }
}
```

---

## Phase 3: Local Scheduling

### 3.1 Scheduler Implementation

**src/scheduler/scheduler.ts:**
```typescript
import { EdgeDatabase } from '../database/db';
import { iMessageSender } from '../iMessage/sender';
import { EventEmitter } from 'events';

export class MessageScheduler extends EventEmitter {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(
    private db: EdgeDatabase,
    private sender: iMessageSender,
    private checkIntervalMs: number = 30000 // 30 seconds
  ) {
    super();
  }

  start() {
    console.log('Starting scheduler...');
    this.intervalId = setInterval(() => this.checkAndExecute(), this.checkIntervalMs);

    // Run immediately on start
    this.checkAndExecute();
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async checkAndExecute() {
    try {
      const pending = this.db.getPendingMessages();

      console.log(`Found ${pending.length} pending messages`);

      for (const msg of pending) {
        console.log(`Executing scheduled message: ${msg.id}`);

        const success = await this.sender.sendMessage(
          msg.threadId,
          msg.messageText,
          msg.isGroup
        );

        if (success) {
          this.db.markMessageSent(msg.id);

          // Emit event for backend reporting
          this.emit('message_sent', {
            messageId: msg.id,
            threadId: msg.threadId,
            commandId: msg.commandId,
            timestamp: new Date()
          });

          console.log(`✅ Sent scheduled message: ${msg.id}`);
        } else {
          console.error(`❌ Failed to send scheduled message: ${msg.id}`);

          // Emit error event
          this.emit('execution_error', {
            messageId: msg.id,
            error: 'Failed to send via iMessage'
          });
        }
      }
    } catch (error) {
      console.error('Scheduler error:', error);
    }
  }

  addScheduledMessage(msg: {
    id: string;
    threadId: string;
    messageText: string;
    sendAt: Date;
    isGroup: boolean;
    commandId?: string;
  }) {
    this.db.addScheduledMessage(msg);
    console.log(`Scheduled message for ${msg.sendAt.toISOString()}: "${msg.messageText}"`);
  }
}
```

---

## Phase 4: Sync Client

**src/sync/client.ts:**
```typescript
import axios from 'axios';
import { EdgeAuth } from './auth';
import { EventEmitter } from 'events';

export interface EdgeEvent {
  event_id: string;
  event_type: 'message_sent' | 'message_filtered' | 'schedule_executed' | 'error';
  thread_id: string;
  timestamp: string;
  details: Record<string, any>;
  edge_agent_id: string;
}

export interface EdgeCommand {
  command_id: string;
  command_type: 'schedule_message' | 'set_rule' | 'cancel_scheduled';
  payload: any;
  timestamp: string;
}

export class SyncClient extends EventEmitter {
  private syncIntervalId: NodeJS.Timeout | null = null;
  private pendingEvents: EdgeEvent[] = [];
  private lastCommandId: string | null = null;

  constructor(
    private backendUrl: string,
    private auth: EdgeAuth,
    private edgeAgentId: string,
    private syncIntervalMs: number = 60000 // 60 seconds
  ) {
    super();
  }

  start() {
    console.log('Starting sync client...');
    this.syncIntervalId = setInterval(() => this.sync(), this.syncIntervalMs);

    // Initial sync
    this.sync();
  }

  stop() {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;
    }
  }

  queueEvent(event: EdgeEvent) {
    this.pendingEvents.push(event);
  }

  private async sync() {
    try {
      const token = await this.auth.getToken();

      const syncRequest = {
        edge_agent_id: this.edgeAgentId,
        last_command_id: this.lastCommandId,
        pending_events: this.pendingEvents,
        status: {
          scheduled_messages: 0, // TODO: Get from DB
          active_rules: 0,
          uptime_seconds: process.uptime()
        }
      };

      const response = await axios.post(
        `${this.backendUrl}/edge/sync`,
        syncRequest,
        { headers: this.auth.getAuthHeaders() }
      );

      const { commands, ack_events } = response.data;

      // Process commands
      for (const command of commands) {
        this.emit('command', command);
        this.lastCommandId = command.command_id;
      }

      // Remove acknowledged events
      this.pendingEvents = this.pendingEvents.filter(
        e => !ack_events.includes(e.event_id)
      );

      console.log(`Sync complete: ${commands.length} commands, ${ack_events.length} events acked`);
    } catch (error) {
      console.error('Sync error:', error);
    }
  }

  async acknowledgeCommand(commandId: string, status: 'completed' | 'failed', error?: string) {
    try {
      await axios.post(
        `${this.backendUrl}/edge/command/ack`,
        {
          command_id: commandId,
          status,
          error,
          completed_at: new Date().toISOString()
        },
        { headers: this.auth.getAuthHeaders() }
      );
    } catch (error) {
      console.error('Failed to acknowledge command:', error);
    }
  }
}
```

---

## Main Application

**src/index.ts:**
```typescript
import { EdgeDatabase } from './database/db';
import { EdgeAuth } from './sync/auth';
import { SyncClient } from './sync/client';
import { iMessageMonitor } from './iMessage/monitor';
import { iMessageSender } from './iMessage/sender';
import { MessageScheduler } from './scheduler/scheduler';
import { PIIRedactor } from './filter/pii-redactor';
import { RelevanceFilter } from './filter/relevance-filter';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Load config
const config = {
  backendUrl: process.env.BACKEND_URL || 'http://localhost:8000',
  userPhone: process.env.USER_PHONE || '+15551234567',
  messagesDbPath: process.env.MESSAGES_DB_PATH || '~/Library/Messages/chat.db',
  dbPath: process.env.DB_PATH || './edge-agent.db'
};

async function main() {
  console.log('🚀 Starting Edge Agent...');

  // Initialize database
  const db = new EdgeDatabase(config.dbPath);

  // Initialize authentication
  const auth = new EdgeAuth(config.backendUrl, config.userPhone);
  const edgeAgentId = await auth.register();
  console.log(`Registered as: ${edgeAgentId}`);

  // Initialize components
  const sender = new iMessageSender();
  const monitor = new iMessageMonitor(config.messagesDbPath);
  const scheduler = new MessageScheduler(db, sender);
  const piiRedactor = new PIIRedactor({
    phone: "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b",
    email: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b",
    address: "\\b\\d+\\s+[\\w\\s]+(?:Street|St|Avenue|Ave)\\b"
  });
  const relevanceFilter = new RelevanceFilter(
    ["sage", "echo", "remind", "schedule", "plan"],
    ["password", "ssn"]
  );

  // Initialize sync client
  const syncClient = new SyncClient(config.backendUrl, auth, edgeAgentId);

  // Handle commands from backend
  syncClient.on('command', async (command) => {
    console.log(`Received command: ${command.command_type} (${command.command_id})`);

    try {
      switch (command.command_type) {
        case 'schedule_message':
          scheduler.addScheduledMessage({
            id: uuidv4(),
            threadId: command.payload.thread_id,
            messageText: command.payload.message_text,
            sendAt: new Date(command.payload.send_at),
            isGroup: command.payload.is_group,
            commandId: command.command_id
          });
          await syncClient.acknowledgeCommand(command.command_id, 'completed');
          break;

        default:
          console.warn(`Unknown command type: ${command.command_type}`);
      }
    } catch (error) {
      console.error(`Failed to execute command: ${error}`);
      await syncClient.acknowledgeCommand(command.command_id, 'failed', String(error));
    }
  });

  // Report scheduled message executions
  scheduler.on('message_sent', (data) => {
    syncClient.queueEvent({
      event_id: uuidv4(),
      event_type: 'schedule_executed',
      thread_id: data.threadId,
      timestamp: data.timestamp.toISOString(),
      details: {
        message_id: data.messageId,
        command_id: data.commandId
      },
      edge_agent_id: edgeAgentId
    });
  });

  // Start services
  scheduler.start();
  syncClient.start();

  // Main message processing loop
  setInterval(async () => {
    const messages = await monitor.pollNewMessages();

    for (const msg of messages) {
      console.log(`New message from ${msg.sender}: ${msg.text.substring(0, 50)}...`);

      // Filter for relevance
      const filterResult = relevanceFilter.filter(msg.text, msg.isGroup);

      if (!filterResult.shouldSendToBackend) {
        console.log(`Filtered out: ${filterResult.reason}`);

        syncClient.queueEvent({
          event_id: uuidv4(),
          event_type: 'message_filtered',
          thread_id: msg.threadId,
          timestamp: new Date().toISOString(),
          details: { reason: filterResult.reason },
          edge_agent_id: edgeAgentId
        });

        continue;
      }

      // Redact PII
      const { redacted, fields } = piiRedactor.redact(msg.text);

      // Send to backend
      try {
        const response = await axios.post(
          `${config.backendUrl}/edge/message`,
          {
            thread_id: msg.threadId,
            sender: msg.sender,
            filtered_text: redacted,
            original_timestamp: msg.timestamp.toISOString(),
            is_group: msg.isGroup,
            participants: msg.participants,
            was_redacted: fields.length > 0,
            redacted_fields: fields,
            filter_reason: filterResult.reason
          },
          { headers: auth.getAuthHeaders() }
        );

        if (response.data.should_respond) {
          await sender.sendMessage(msg.threadId, response.data.reply_text, msg.isGroup);
        }
      } catch (error) {
        console.error('Failed to process message with backend:', error);
      }
    }
  }, 5000); // Poll every 5 seconds

  console.log('✅ Edge Agent running');
}

main().catch(console.error);
```

---

## Testing Strategy

### Unit Tests

**test/filter.test.ts:**
```typescript
import { PIIRedactor } from '../src/filter/pii-redactor';
import { RelevanceFilter } from '../src/filter/relevance-filter';

describe('PIIRedactor', () => {
  it('should redact phone numbers', () => {
    const redactor = new PIIRedactor({
      phone: "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b"
    });

    const result = redactor.redact('Call me at 555-123-4567');
    expect(result.redacted).toBe('Call me at [PHONE]');
    expect(result.fields).toContain('phone');
  });
});

describe('RelevanceFilter', () => {
  it('should pass messages with planning keywords', () => {
    const filter = new RelevanceFilter(['plan', 'remind'], []);
    const result = filter.filter('what's the plan for dinner?', false);

    expect(result.shouldSendToBackend).toBe(true);
    expect(result.reason).toBe('planning_request');
  });

  it('should filter casual group chat', () => {
    const filter = new RelevanceFilter(['plan'], []);
    const result = filter.filter('lol that's funny', true);

    expect(result.shouldSendToBackend).toBe(false);
    expect(result.reason).toBe('casual_group_chat');
  });
});
```

### Integration Tests

Test with real backend:
```bash
# Start edge agent with test config
BACKEND_URL=https://archety-backend.onrender.com \
USER_PHONE=+15551234567 \
npm start
```

---

## Deployment & Operations

### Installation on Mac Mini

```bash
# 1. Clone repository
git clone https://github.com/your-org/edge-agent.git
cd edge-agent

# 2. Install dependencies
npm install

# 3. Configure
cp config.example.yaml config.yaml
# Edit config.yaml with your settings

# 4. Set environment variables
export BACKEND_URL="https://archety-backend.onrender.com"
export USER_PHONE="+15551234567"
export EDGE_SECRET="your-shared-secret"
export REGISTRATION_TOKEN="edge_initial_token"

# 5. Test
npm test

# 6. Start
npm start
```

### Run as Service (macOS LaunchAgent)

**~/Library/LaunchAgents/com.archety.edge-agent.plist:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.archety.edge-agent</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/edge-agent/dist/index.js</string>
    </array>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/tmp/edge-agent.log</string>

    <key>StandardErrorPath</key>
    <string>/tmp/edge-agent.error.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>BACKEND_URL</key>
        <string>https://archety-backend.onrender.com</string>
        <key>USER_PHONE</key>
        <string>+15551234567</string>
    </dict>
</dict>
</plist>
```

Load the service:
```bash
launchctl load ~/Library/LaunchAgents/com.archety.edge-agent.plist
```

### Monitoring

**Health Check:**
```bash
curl http://localhost:3000/health
```

**Logs:**
```bash
tail -f /tmp/edge-agent.log
```

---

## Security Considerations

### 1. Messages Database Access

The Messages database requires special permissions:

```bash
# Grant Full Disk Access to Terminal
# System Preferences → Security & Privacy → Full Disk Access
# Add Terminal.app
```

### 2. Secure Token Storage

```typescript
// Store token in keychain instead of environment
import keytar from 'keytar';

await keytar.setPassword('edge-agent', 'auth-token', token);
const token = await keytar.getPassword('edge-agent', 'auth-token');
```

### 3. Network Security

- Always use HTTPS for backend communication
- Verify TLS certificates
- Implement request signing

---

## Troubleshooting

### Common Issues

**Issue:** "Cannot read Messages database"
```bash
# Solution: Grant Full Disk Access
sudo sqlite3 ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message;"
```

**Issue:** "AppleScript not working"
```bash
# Solution: Grant Automation permission
# System Preferences → Security & Privacy → Automation
# Allow Terminal to control Messages
```

**Issue:** "Backend returns 401 Unauthorized"
```bash
# Solution: Regenerate token
# Delete old token and re-register
rm -f edge-agent.db
npm start
```

---

## Next Steps After MVP

1. **Performance Optimization**
   - Batch message processing
   - Connection pooling
   - Caching improvements

2. **Advanced Features**
   - Voice message transcription
   - Image recognition
   - Multi-device sync

3. **Production Hardening**
   - Error recovery
   - Automatic reconnection
   - Backup/restore system

---

## Support

- **Backend Engineer:** Engineer 2
- **Backend API Docs:** https://archety-backend.onrender.com/docs
- **Edge Agent Spec:** `/docs/EDGE_AGENT_SPEC.md`

---

**Good luck building! The backend is ready and waiting for you.**