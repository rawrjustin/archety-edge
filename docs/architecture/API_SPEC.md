# Backend API Specification

Protocol for communication between edge relay and backend.

## Authentication

All requests use HMAC-SHA256 authentication:

### Request Headers
```
X-Edge-Agent-ID: edge_1234567890
X-Timestamp: 1234567890
X-Signature: <HMAC-SHA256 signature>
```

### Signature Calculation
```typescript
const payload = `${method}:${path}:${timestamp}:${body}`;
const signature = crypto
  .createHmac('sha256', EDGE_SECRET)
  .update(payload)
  .digest('hex');
```

## Endpoints

### POST /edge/register

Register edge agent with backend.

**Request:**
```json
{
  "user_phone": "+1234567890",
  "registration_token": "edge_initial_token"
}
```

**Response:**
```json
{
  "edge_agent_id": "edge_1234567890",
  "auth_token": "jwt_token_here"
}
```

---

### POST /edge/message

Forward incoming message to backend for processing.

**Request:**
```json
{
  "thread_id": "iMessage;-;+1234567890",
  "sender": "+1234567890",
  "filtered_text": "hey, when are we meeting tomorrow?",
  "original_timestamp": "2025-11-04T10:30:00Z",
  "is_group": false,
  "participants": ["+1234567890"],
  "was_redacted": false,
  "redacted_fields": [],
  "filter_reason": "phase1_transport"
}
```

**Response (Legacy Format):**
```json
{
  "should_respond": true,
  "reply_text": "Tomorrow at 2pm works great!"
}
```

**Response (Multi-Bubble Format):**
```json
{
  "should_respond": true,
  "reply_bubbles": [
    "Tomorrow at 2pm works great!",
    "I'll see you at the coffee shop",
    "Let me know if that changes"
  ]
}
```

**Response (Fast Reflex Format - NEW):**
```json
{
  "should_respond": true,
  "reflex_message": "ooh sounds fun!",
  "burst_messages": [
    "i've been wanting to try that place",
    "what time were you thinking?"
  ],
  "burst_delay_ms": 2000
}
```

---

### POST /edge/sync

Bidirectional sync: edge agent sends events, backend sends commands.

**Request:**
```json
{
  "edge_agent_id": "edge_1234567890",
  "last_command_id": "cmd_abc123",
  "pending_events": [
    {
      "event_id": "evt_xyz789",
      "event_type": "message_sent",
      "thread_id": "iMessage;-;+1234567890",
      "details": {
        "message_id": "scheduled_msg_123",
        "sent_at": "2025-11-04T10:30:00Z"
      }
    }
  ],
  "status": {
    "scheduled_messages": 5,
    "active_rules": 0,
    "uptime_seconds": 3600
  }
}
```

**Response:**
```json
{
  "ack_events": ["evt_xyz789"],
  "commands": [
    {
      "command_id": "cmd_def456",
      "command_type": "schedule_message",
      "params": {
        "thread_id": "iMessage;-;+1234567890",
        "text": "Reminder: meeting at 2pm",
        "send_at": "2025-11-05T14:00:00Z",
        "is_group": false
      }
    }
  ],
  "config_updates": {
    "sync_interval": 60
  }
}
```

---

### POST /edge/ack_command

Acknowledge command execution.

**Request:**
```json
{
  "command_id": "cmd_def456",
  "success": true,
  "error": null,
  "result": {
    "scheduled_message_id": "scheduled_msg_124"
  }
}
```

**Response:**
```json
{
  "acknowledged": true
}
```

---

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

## Commands

Commands sent from backend to edge agent via sync endpoint.

### schedule_message

Schedule a message for future delivery.

```json
{
  "command_id": "cmd_123",
  "command_type": "schedule_message",
  "params": {
    "thread_id": "iMessage;-;+1234567890",
    "text": "Reminder: Your meeting starts in 15 minutes",
    "send_at": "2025-11-05T14:00:00Z",
    "is_group": false
  }
}
```

### cancel_message

Cancel a scheduled message.

```json
{
  "command_id": "cmd_124",
  "command_type": "cancel_message",
  "params": {
    "message_id": "scheduled_msg_123"
  }
}
```

### list_scheduled

Query scheduled messages.

```json
{
  "command_id": "cmd_125",
  "command_type": "list_scheduled",
  "params": {
    "status": "pending"  // Optional filter
  }
}
```

## Events

Events sent from edge agent to backend via sync endpoint.

### message_sent

Scheduled message was sent successfully.

```json
{
  "event_id": "evt_123",
  "event_type": "message_sent",
  "thread_id": "iMessage;-;+1234567890",
  "details": {
    "message_id": "scheduled_msg_123",
    "sent_at": "2025-11-05T14:00:00Z"
  }
}
```

### message_failed

Scheduled message failed to send.

```json
{
  "event_id": "evt_124",
  "event_type": "message_failed",
  "thread_id": "iMessage;-;+1234567890",
  "details": {
    "message_id": "scheduled_msg_123",
    "error": "AppleScript error: Messages.app not running"
  }
}
```

## Message Response Formats

### Legacy Single Message
```json
{
  "should_respond": true,
  "reply_text": "Simple response"
}
```

### Multi-Bubble Response
```json
{
  "should_respond": true,
  "reply_bubbles": [
    "First bubble",
    "Second bubble",
    "Third bubble"
  ]
}
```

### Fast Reflex Response (Recommended)

Send immediate reflex followed by delayed burst messages:

```json
{
  "should_respond": true,
  "reflex_message": "ooh how was it?",
  "burst_messages": [
    "i've been wanting to check that place out!",
    "did you try their signature dish?"
  ],
  "burst_delay_ms": 2000
}
```

**Behavior:**
1. Edge agent sends `reflex_message` immediately (~100ms)
2. After `burst_delay_ms`, sends each `burst_messages` with natural timing
3. Creates more natural, responsive conversation flow

**When to Use:**
- **Reflex only**: Short, emotional reactions ("ugh that sucks 💙", "omg yes!")
- **Reflex + Burst**: Immediate reaction + follow-up questions/elaboration
- **Burst only**: No immediate reaction needed, just send bubbles sequentially

See [REFLEX_IMPLEMENTATION.md](./REFLEX_IMPLEMENTATION.md) for details.

## Error Handling

### HTTP Status Codes
- `200` - Success
- `401` - Unauthorized (invalid signature or token)
- `429` - Rate limited
- `500` - Server error

### Error Response Format
```json
{
  "error": "invalid_signature",
  "message": "HMAC signature verification failed"
}
```

### Edge Agent Behavior

**On 401 Unauthorized:**
- Attempt token refresh
- If refresh fails, re-register
- Retry original request

**On Network Error:**
- Log error
- Continue with next sync interval
- Don't block message processing

**On Timeout:**
- Log warning
- Return safe default (no response)
- Continue processing

## Rate Limiting

Backend may implement rate limiting:
- Max 100 requests/minute per edge agent
- Max 10 concurrent connections
- Exponential backoff on 429 responses

## Configuration Updates

Backend can push configuration updates via sync response:

```json
{
  "config_updates": {
    "sync_interval": 30,  // New sync interval in seconds
    "poll_interval": 1,   // New poll interval in seconds
    "max_batch_size": 5   // Max messages per batch
  }
}
```

Edge agent applies updates immediately and restarts affected loops.

## See Also

- [Fast Reflex Implementation](./REFLEX_IMPLEMENTATION.md) - Detailed reflex protocol
- [Architecture Overview](./OVERVIEW.md) - System design
- [Performance Guide](./PERFORMANCE.md) - Optimization details
