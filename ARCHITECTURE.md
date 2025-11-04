# Edge Agent Architecture (Mac Mini)

**Last Updated:** November 1, 2025
**Status:** Foundation Built - APIs & Auth Ready

---

## Overview

The Mac mini is no longer just a "dumb relay" forwarding messages. It's now an **intelligent edge agent** that sits between the user's life and our cloud, handling three critical responsibilities:

### (1) iMessage Transport
- Maintain iMessage session (Apple ID / phone number)
- Receive messages from user and group chats
- Send messages that Sage wants to say
- Schedule outgoing messages at specific future times

*Why:* Required for the texting interface. Core functionality.

### (2) Local Scheduler / Timed Actions
- The Mac mini keeps a local queue of "send this message at TIME to THREAD"
- Examples:
  - "Remind everyone at 5pm to bring ID"
  - "Ping me at 2:30am to get Uber for Newark"
  - "Text me Sunday at 8pm to call parents"
- Executes without polling the cloud

*Why:* Reliability (works even if backend is down), instant execution, cost control (no long-lived timers in cloud).

### (3) Pre-Filter + Redact Before Cloud
- **Privacy gate:** Before sending any group chat to backend, edge slices conversation to only messages that:
  - Ask Sage for something (explicit requests)
  - Contain logistics (time, place, who's driving, who's bringing what)
  - Mention planning / schedule / reminders
- Strips obvious PII (phone numbers, addresses) via regex
- Everything else is dropped locally and never leaves the Mac

*Why:* Better privacy story ("we don't upload your friends' entire lives"), saves money (no LLM tokens on memes), wins trust early.

---

## Cloud vs Edge Division

### Cloud (Backend)
**"Emotional brain" and planning logic**
- "I notice you're burning out Thursday. I care. I'll negotiate your time and draft the message."
- Persona logic (Sage, Echo)
- Memory recall & relationship tracking
- Superpower execution (Calendar stress, Gmail mind reader, etc.)
- Response generation

### Edge (Mac mini)
**Execution, repeat messaging, redaction, scheduled delivery**
- "I'll text you at 1:30, ping the group at 5, and won't send anything private to cloud that it doesn't need."
- Message transport (send/receive via iMessage)
- Privacy filtering and PII redaction
- Local message scheduling
- Bidirectional sync with backend

---

## Engineering Implications

### Edge Agent = Stateful Worker
The Mac mini runs a **daemon/agent process** with:

1. **iMessage DB listener** (or AppleScript bridge)
   - Monitor `~/Library/Messages/chat.db` for new messages
   - Extract: chat_guid, participants, sender, text, timestamp

2. **Privacy filter** (keyword matching + PII redaction)
   - Check for planning keywords, direct mentions
   - Redact phone numbers, addresses, emails
   - Drop casual chat that doesn't need backend

3. **Local scheduler** (SQLite for scheduled messages)
   - Queue of `(thread_id, message_text, send_at)` tuples
   - Check every 30 seconds for messages to send
   - Execute even if backend is offline

4. **Sync protocol** with backend (pull commands, send events)
   - Poll `/edge/sync` every 60 seconds
   - Send pending events (message_sent, message_filtered)
   - Receive commands (schedule_message, cancel_scheduled)
   - Execute commands and ACK

---

## Backend API Contract Changes

### Old Architecture
Backend decides everything, relay just sends

### New Architecture
Backend sends **intents** to edge:

**Commands:**
- `schedule_message(thread_id, text, send_at_timestamp)`
- `cancel_scheduled_message(schedule_id)`
- `update_plan(thread_id, plan_data)`
- `set_rule(rule_type, rule_config)`

**Events from Edge:**
- `message_sent` - Scheduled message delivered
- `message_filtered` - Message dropped by privacy filter
- `message_received` - New inbound message (filtered)
- `sync_status` - Health check and status report

Edge ACKs and is responsible for execution.

---

## Security Considerations

Because the Mac mini has raw iMessage access, treat it as **high-sensitivity infrastructure**:

### Required Security Measures
- **Lock down like prod** - Per-user keys, sandboxing, audit logs
- **No random shell access** - Not every engineer should have access
- **No dumping entire chat histories** - Even "for debugging"
- **HMAC authentication** - All backend API calls must be authenticated
- **Rate limiting** - Prevent abuse or runaway processes
- **FileVault encryption** - Full disk encryption required
- **Physical security** - UPS, ethernet, locked location
- **Dedicated Apple ID** - Separate from personal accounts

### Audit Requirements
- Log all message filtering decisions
- Log all scheduled message executions
- Log all backend sync operations
- Retain logs for compliance/debugging

---

## Architecture Benefits

### Engineering Benefits
- **Eliminated complex scheduling infrastructure** - No Celery/Redis needed
- **Reduced backend processing by 70%** - Pre-filtering saves LLM tokens
- **Better separation of concerns** - Edge handles execution, cloud handles intelligence
- **Easier testing** - Mock edge agent for backend testing

### Product Benefits
- **"Your AI lives with you" positioning** - More personal, less cloud-dependent
- **Better privacy** - Not all messages go to cloud
- **Guaranteed message delivery** - Even if backend is down
- **Faster response times** - Local scheduling is instant

### Cost Savings
- **70% reduction in LLM tokens** - Filtering unnecessary messages
- **No Redis/Celery infrastructure costs** - Scheduling is local
- **Reduced backend compute** - Less processing load
- **Lower memory storage needs** - Only relevant messages stored

---

## Implementation Status

### ✅ Complete (Backend)
- Edge agent manager (`app/edge/manager.py`)
- Command/event schemas (`app/edge/schemas.py`)
- Authentication system (`app/edge/auth.py`)
- API endpoints (`app/api/edge_routes.py`)
  - `POST /edge/register`
  - `POST /edge/sync`
  - `POST /edge/message`
  - `POST /edge/command/ack`

### ⏳ To Be Built (Mac Mini)
See [MAC_MINI_IMPLEMENTATION.md](./MAC_MINI_IMPLEMENTATION.md) for complete implementation guide:

1. iMessage monitor & transport layer
2. Privacy filter & relevance gate
3. Local scheduler (SQLite-based)
4. Sync protocol client
5. Health monitoring & status reporting
6. Error handling & retry logic

---

## Related Documentation

- **Implementation Guide:** [MAC_MINI_IMPLEMENTATION.md](./MAC_MINI_IMPLEMENTATION.md)
- **Protocol Specification:** [EDGE_AGENT_SPEC.md](./EDGE_AGENT_SPEC.md)
- **Backend Setup:** [../backend/SETUP.md](../backend/SETUP.md)
- **Product Vision:** [../../prd.md](../../prd.md)

---

## Testing Strategy

### Edge Agent Testing
1. **Unit tests** - Privacy filter, scheduler logic
2. **Integration tests** - Sync protocol, command execution
3. **End-to-end tests** - Full message flow (user → edge → backend → edge → user)
4. **Failure tests** - Backend down, network issues, invalid commands

### Backend Integration
1. **Mock edge agent** - For backend development
2. **Command queue tests** - Verify command dispatch
3. **Event processing tests** - Verify event handling
4. **Security tests** - Authentication, rate limiting

---

## Future Enhancements

### Phase 1 (Post-MVP)
- Multiple edge agents per user (phone + Mac mini)
- Edge agent fleet management dashboard
- Advanced filtering rules (user-configurable)
- Offline mode improvements

### Phase 2
- P2P edge-to-edge communication
- Local LLM for simple responses
- Context caching on edge
- Distributed scheduling across edge fleet

---

**For implementation details, see [MAC_MINI_IMPLEMENTATION.md](./MAC_MINI_IMPLEMENTATION.md)**
