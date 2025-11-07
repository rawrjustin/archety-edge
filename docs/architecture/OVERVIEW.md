# Architecture Overview

## System Design

The edge relay is a Node.js application that bridges iMessage with a cloud backend, enabling intelligent message processing and scheduled responses.

```
┌─────────────────────────────────────────────────────────────┐
│                        Edge Relay                            │
│                     (Mac mini / macOS)                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐      ┌──────────────┐    ┌─────────────┐ │
│  │  Messages DB │◄─────│   Transport  │────►│  Scheduler  │ │
│  │   Polling    │      │  AppleScript │    │   SQLite    │ │
│  └──────────────┘      └──────────────┘    └─────────────┘ │
│         │                      │                   │         │
│         ▼                      ▼                   ▼         │
│  ┌────────────────────────────────────────────────────────┐ │
│  │              Main Event Loop (index.ts)                 │ │
│  │  • Polls for new iMessages every 2s                    │ │
│  │  • Processes messages in parallel (up to 3 concurrent) │ │
│  │  • Syncs with backend every 60s                        │ │
│  │  • Executes scheduled messages                         │ │
│  └────────────────────────────────────────────────────────┘ │
│                            │                                 │
│                            ▼                                 │
│                  ┌──────────────────┐                       │
│                  │  Backend Client  │                       │
│                  │  (RenderClient)  │                       │
│                  │  • HMAC Auth     │                       │
│                  │  • HTTP/2 Pool   │                       │
│                  └──────────────────┘                       │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
                           ▼
              ┌────────────────────────┐
              │   Backend (Render)     │
              │  • Message processing  │
              │  • Response generation │
              │  • Command orchestr.   │
              └────────────────────────┘
```

## Core Components

### 1. Message Transport (`src/transports/`)

**AppleScriptTransport** - Main transport implementation
- **MessagesDB** - Polls Messages database for new incoming messages
- **AppleScriptSender** - Sends outgoing messages via AppleScript

**Key Features:**
- Database pre-check optimization (60-70% CPU reduction)
- Batch AppleScript execution (5× faster multi-bubble sends)
- Group chat support
- Thread ID handling

### 2. Backend Client (`src/backend/`)

**RenderClient** - HTTP client for backend communication
- HMAC-based authentication (EdgeAuth)
- HTTP connection pooling (20-30% latency reduction)
- Token management and refresh
- Health checking

### 3. Scheduler (`src/scheduler/`)

**Scheduler** - SQLite-based message scheduling
- Schedule messages for future delivery
- Persistent storage (survives restarts)
- Command-based scheduling from backend
- Optimized stats queries

### 4. Command Handler (`src/commands/`)

**CommandHandler** - Processes backend commands
- `schedule_message` - Schedule a future message
- `cancel_message` - Cancel scheduled message
- `list_scheduled` - Query scheduled messages
- Extensible command system

### 5. Main Application (`src/index.ts`)

**EdgeAgent** - Main orchestrator
- Message polling loop (every 2s)
- Sync loop with backend (every 60s)
- Parallel message processing (up to 3 concurrent)
- Fast reflex message path
- Graceful shutdown handling

## Data Flow

### Incoming Message Flow

```
1. User sends iMessage
   ↓
2. Messages.app saves to SQLite DB
   ↓
3. MessagesDB polls database (every 2s)
   ↓
4. Transport extracts message data
   ↓
5. EdgeAgent processes message
   ↓
6. Backend receives message via HTTP POST
   ↓
7. Backend generates response
   ↓
8. EdgeAgent receives response
   ↓
9. AppleScriptSender sends via Messages.app
   ↓
10. User receives response
```

**Optimizations:**
- **Database pre-check**: Skip expensive JOINs when no new messages (60-70% CPU reduction)
- **Parallel processing**: Handle up to 3 messages concurrently (2-3× throughput)
- **Connection pooling**: Reuse HTTP connections (20-30% latency reduction)

### Outgoing Message Flow (Reflex)

```
Backend determines reflex needed
   ↓
Returns { reflex_message, burst_messages }
   ↓
EdgeAgent sends reflex IMMEDIATELY (~100ms)
   ↓
User sees instant response
   ↓
After 2s delay, burst messages sent
   ↓
Natural conversation flow
```

### Scheduled Message Flow

```
Backend sends schedule_message command
   ↓
CommandHandler processes command
   ↓
Scheduler stores in SQLite
   ↓
Scheduler checks every 30s for due messages
   ↓
When time arrives, sends via Transport
   ↓
Scheduler marks as sent
   ↓
Backend receives confirmation
```

## Interface Design

All core components use interfaces for testability and future Swift migration:

- **IMessageTransport** - Message sending/receiving
- **IBackendClient** - Backend communication
- **ILogger** - Logging abstraction

This allows swapping implementations without changing the main application logic.

## Database Schema

### Messages DB (read-only, Apple's database)

```sql
-- Core tables we read from
message (
  ROWID,           -- Unique message ID
  text,            -- Message content
  date,            -- Timestamp (Apple epoch)
  is_from_me,      -- Direction (0 = incoming, 1 = outgoing)
  handle_id        -- Foreign key to sender
)

chat (
  ROWID,
  chat_identifier, -- Thread ID (iMessage;-;+1234567890)
  display_name     -- Chat name
)

handle (
  ROWID,
  id               -- Phone number or email
)
```

### Scheduler DB (our database)

```sql
scheduled_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  text TEXT NOT NULL,
  send_at INTEGER NOT NULL,  -- Unix timestamp
  is_group INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- pending, sent, failed, cancelled
  command_id TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
)

-- Optimized index for pending message queries
CREATE INDEX idx_send_at ON scheduled_messages(send_at)
  WHERE status = 'pending';
```

## Performance Optimizations

### Database Pre-Check
Fast COUNT query before expensive JOINs saves ~60-70% CPU during idle.

### HTTP Connection Pooling
Reuses TCP connections with keepAlive, reducing latency by 20-30%.

### Parallel Message Processing
Processes up to 3 messages concurrently instead of sequentially (2-3× throughput).

### Batch AppleScript
Sends multiple message bubbles in single AppleScript execution (5× faster).

### Optimized Queries
Single GROUP BY query instead of 4 separate queries for stats (75% faster).

See [PERFORMANCE.md](./PERFORMANCE.md) for detailed metrics.

## Security

### Authentication
- HMAC-SHA256 signatures on all requests
- Rotating authentication tokens
- Shared secret (EDGE_SECRET) never transmitted

### Data Privacy
- Messages database access requires Full Disk Access permission
- All backend communication over HTTPS
- No message content stored permanently (only scheduled messages in scheduler DB)

### Permissions Required
- **Full Disk Access** - Read Messages database
- **Automation** - Control Messages.app via AppleScript

## Configuration

See [Configuration Guide](../setup/CONFIGURATION.md) for details.

Key configuration areas:
- Performance profiles (balanced, low-latency, low-resource)
- Polling intervals
- Backend connection settings
- Logging levels

## Error Handling

### Graceful Degradation
- Database read errors → Return empty array, continue polling
- Backend errors → Return safe default response, retry next sync
- AppleScript errors → Log error, continue processing

### Automatic Recovery
- Reconnect on network errors
- Retry failed scheduled messages
- Token refresh on 401 errors

### Monitoring
- Structured logging (debug, info, warn, error)
- Health checks every sync
- Status reporting via backend sync

## Testing Strategy

- **Unit tests** - Individual component testing with mocks
- **Integration tests** - End-to-end message flow testing
- **Manual testing** - Real iMessage send/receive verification

Current coverage: 73.74% (144 passing tests)

See [Testing Guide](../development/TESTING.md) for details.

## Future Enhancements

### Phase 3: Native Swift Bridge
Replace AppleScript with native Swift NSAppleScript framework:
- 10× faster message sending (30ms vs 300ms)
- More reliable AppleScript execution
- Better error handling

### Phase 4: Adaptive Scheduler
Check for scheduled messages based on next due time instead of fixed 30s interval:
- Near-instant message delivery (<1s vs 15s average)
- Reduced unnecessary database queries

### Phase 5: Event-Driven Architecture
Use FSEvents or SQLite triggers instead of polling:
- Instant message detection (0ms vs 0-2s)
- Zero CPU usage when idle
- More complex implementation

## See Also

- [Performance Details](./PERFORMANCE.md) - Optimization deep-dive
- [API Specification](./API_SPEC.md) - Backend protocol
- [Development Guide](../development/CONTRIBUTING.md) - Making changes
