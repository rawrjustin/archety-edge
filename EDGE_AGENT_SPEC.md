# Edge Agent Specification

## Overview

The Edge Agent transforms the Mac mini from a simple iMessage relay into an intelligent local processing node that handles scheduling, filtering, caching, and execution of pre-approved actions. This document specifies the Edge Agent architecture, protocols, and implementation requirements.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   USER DEVICE                    │
│                    (iPhone)                      │
└─────────────┬───────────────────────┬───────────┘
              │                       │
              │ iMessage              │ iMessage
              ▼                       ▼
┌─────────────────────────────────────────────────┐
│                 EDGE AGENT                       │
│               (Mac mini box)                     │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐            │
│  │   Filter &   │  │   Local      │            │
│  │   Redact     │  │   Scheduler  │            │
│  └──────────────┘  └──────────────┘            │
│                                                  │
│  ┌──────────────┐                               │
│  │   Rule       │                               │
│  │   Engine     │                               │
│  └──────────────┘                               │
└─────────────┬───────────────────────────────────┘
              │
              │ HTTPS (filtered/scheduled)
              ▼
┌─────────────────────────────────────────────────┐
│                BACKEND CLOUD                     │
│         (Orchestrator + Memory + LLM)            │
└─────────────────────────────────────────────────┘
```

## Core Responsibilities

### 1. Inbound Message Filtering

**Purpose:** Privacy protection and cost reduction by filtering messages before cloud transmission.

**Implementation:**
```python
def filter_message(message: RawMessage) -> Optional[FilteredMessage]:
    # Step 1: Check if message needs cloud processing
    if not requires_cloud_processing(message):
        return None  # Handle locally or ignore

    # Step 2: Redact PII
    filtered_text = redact_pii(message.text)

    # Step 3: Extract logistics/planning content
    if is_group_chat(message):
        filtered_text = extract_planning_content(filtered_text)

    # Step 4: Add metadata
    return FilteredMessage(
        filtered_text=filtered_text,
        was_redacted=True,
        filter_reason="planning_request"
    )
```

**Filter Rules:**
- **Pass to cloud:** Direct questions to Sage/Echo, planning requests, scheduling, reminders
- **Handle locally:** Scheduled messages, recurring rules
- **Drop:** Casual chat, memes, sensitive content not related to planning

### 2. Local Message Scheduling

**Purpose:** Guarantee message delivery at specified times without cloud dependency.

**Database Schema:**
```sql
CREATE TABLE scheduled_messages (
    id UUID PRIMARY KEY,
    thread_id VARCHAR(255) NOT NULL,
    message_text TEXT NOT NULL,
    send_at TIMESTAMP NOT NULL,
    is_group BOOLEAN DEFAULT FALSE,
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT NOW(),
    command_id VARCHAR(255)  -- Links to backend command
);

CREATE INDEX idx_send_at ON scheduled_messages(send_at)
WHERE status = 'pending';
```

**Execution Loop:**
```python
async def scheduler_loop():
    while True:
        # Check for messages to send
        pending = db.query(
            "SELECT * FROM scheduled_messages
             WHERE send_at <= NOW() AND status = 'pending'"
        )

        for msg in pending:
            # Send via iMessage
            send_imessage(msg.thread_id, msg.message_text)

            # Update status
            msg.status = 'sent'
            db.commit()

            # Report to backend
            report_event(EventType.SCHEDULE_EXECUTED, msg)

        await asyncio.sleep(30)  # Check every 30 seconds
```

### 3. Simple Rule Execution

**Purpose:** Execute recurring actions without cloud polling.

**Rule Types:**
- **Recurring reminders:** "Every Friday at noon remind me to call parents"
- **Time-based triggers:** "30 minutes before calendar events"
- **Keyword triggers:** "When I say 'goodnight' set Do Not Disturb"

**Rule Engine:**
```python
class RuleEngine:
    def __init__(self):
        self.rules = []  # Loaded from database
        self.cron_scheduler = CronScheduler()

    def add_rule(self, rule: Rule):
        if rule.trigger_type == "cron":
            self.cron_scheduler.add(
                rule.id,
                rule.trigger_config["expression"],
                lambda: self.execute_rule(rule)
            )
        self.rules.append(rule)

    def execute_rule(self, rule: Rule):
        if rule.action_type == "send_message":
            # Template interpolation
            text = rule.action_config["template"]
            text = text.replace("{{date}}", datetime.now().strftime("%B %d"))

            send_imessage(
                rule.action_config["thread_id"],
                text
            )
```

## Communication Protocol

### Edge → Backend Sync

**Endpoint:** `POST /edge/sync`

**Request:**
```json
{
  "edge_agent_id": "edge_15551234567",
  "last_command_id": "cmd_abc123",
  "pending_events": [
    {
      "event_id": "evt_xyz",
      "event_type": "message_filtered",
      "thread_id": "thread_123",
      "details": {
        "original_length": 500,
        "filtered_length": 120,
        "redacted_fields": ["phone", "address"]
      }
    }
  ],
  "status": {
    "scheduled_messages": 3,
    "active_rules": 2,
    "uptime_seconds": 86400
  }
}
```

**Response:**
```json
{
  "commands": [
    {
      "command_id": "cmd_def456",
      "command_type": "schedule_message",
      "payload": {
        "thread_id": "thread_123",
        "message_text": "Reminder: Leave for airport now!",
        "send_at": "2024-11-01T14:30:00Z"
      }
    }
  ],
  "ack_events": ["evt_xyz"],
  "config_updates": {
    "sync_interval": 60
  }
}
```

### Authentication

**Token Format:**
```
Bearer <base64(edge_agent_id:user_phone:timestamp:hmac_signature)>
```

**Verification:**
1. Decode base64
2. Split components
3. Verify HMAC signature
4. Check timestamp (24hr expiry)
5. Return EdgeAuthToken object

### Command Types

| Command | Purpose | Payload |
|---------|---------|---------|
| `schedule_message` | Schedule future message | thread_id, message_text, send_at |
| `set_rule` | Create recurring rule | trigger, action, config |
| `cancel_scheduled` | Cancel scheduled message | schedule_id |

### Event Types

| Event | Triggered When | Details |
|-------|----------------|---------|
| `message_sent` | Scheduled message sent | thread_id, message_text |
| `message_filtered` | Message filtered | redacted_fields, filter_reason |
| `rule_triggered` | Rule executed | rule_id, action_taken |
| `error` | Error occurred | error_type, message |

## Security Considerations

### Data Protection
- **Encryption:** All edge↔backend communication uses TLS 1.3
- **Authentication:** HMAC-based token verification
- **PII Handling:** Redaction before transmission
- **Local Storage:** SQLite with encryption at rest

### Access Control
- Each edge agent has unique credentials
- Rate limiting: 100 requests/minute per agent
- Command acknowledgment required for critical operations
- Audit logging of all commands and events

### Privacy Boundaries
- Edge NEVER sends unfiltered group messages to cloud
- Personal data stays local unless explicitly needed
- Redaction patterns updated via config_updates
- User can request local data deletion

## Implementation Phases

### Phase 1: Core Infrastructure (Week 1)
- [x] Edge command/event schemas
- [x] Sync protocol implementation
- [x] Authentication system
- [x] Basic message filtering

### Phase 2: Scheduling (Week 2)
- [ ] Local scheduler implementation
- [ ] AppleScript integration for iMessage
- [ ] Command acknowledgment system

### Phase 3: Advanced Features (Week 3)
- [ ] Rule engine implementation
- [ ] PII redaction patterns
- [ ] Group chat filtering logic
- [ ] Performance optimization

### Phase 4: Production Hardening (Week 4)
- [ ] Encryption at rest
- [ ] Backup/recovery system
- [ ] Monitoring & alerting
- [ ] Edge fleet management

## Testing Strategy

### Unit Tests
- Filter logic with various message types
- Scheduler timing accuracy
- Rule engine execution

### Integration Tests
- End-to-end message flow
- Schedule → execute → report cycle
- Auth token lifecycle

### Security Tests
- PII redaction completeness
- Token expiry handling
- Rate limit enforcement
- Command injection prevention

## Monitoring & Metrics

### Key Metrics
- **Filter efficiency:** % messages filtered locally
- **Schedule accuracy:** % messages sent within 1 minute
- **Sync latency:** Time between event and backend acknowledgment

### Health Checks
```python
GET /edge/health

{
  "status": "healthy",
  "scheduled_pending": 5,
  "last_sync": "2024-11-01T12:00:00Z",
  "uptime_hours": 720
}
```

## Migration Plan

### Backward Compatibility
1. Keep `/orchestrator/message` endpoint during transition
2. Add `edge_enabled` feature flag per user
3. Gradual rollout: 10% → 50% → 100%
4. Fallback to direct relay if edge unavailable

### Data Migration
1. No existing scheduled messages (Phase 6 not implemented)
2. No migration needed for memory (stays in cloud)
3. Edge starts fresh with clean state

## Future Enhancements

### Near-term (Next Sprint)
- Webhook support for external triggers
- More sophisticated PII redaction
- Multi-device sync (iPad, Mac)
- Voice message transcription

### Long-term (Next Quarter)
- Edge ML models for intent classification
- Peer-to-peer edge communication
- Offline mode with sync on reconnect
- Plugin system for custom rules

## Appendix

### A. Example Edge Agent Implementation

See `/edge-agent/` directory for reference implementation in Swift/Node.js

### B. Configuration File

```yaml
# edge-config.yaml
edge:
  agent_id: "edge_15551234567"
  user_phone: "+15551234567"

filtering:
  keywords:
    pass: ["sage", "echo", "remind", "schedule", "plan"]
    block: ["password", "ssn", "credit card"]

  redaction:
    phone: "\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b"
    email: "\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b"

sync:
  interval_seconds: 60
  backend_url: "https://api.archety.com"

scheduler:
  check_interval_seconds: 30
  max_retry_attempts: 3
```

### C. Deployment Checklist

- [ ] Edge agent installed on Mac mini
- [ ] iMessage account configured
- [ ] Network connectivity verified
- [ ] Authentication token generated
- [ ] Initial sync successful
- [ ] Test message sent/received
- [ ] Monitoring dashboard accessible
- [ ] Backup system configured

---

**Document Version:** 1.0
**Last Updated:** November 1, 2024
**Author:** Engineer 2 (Backend/Orchestrator)