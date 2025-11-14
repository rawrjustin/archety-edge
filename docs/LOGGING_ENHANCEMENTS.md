# Logging Enhancements

**Date:** November 6, 2025
**Status:** ✅ Complete

## Overview

Added comprehensive logging to track every message flowing through the edge agent system, making it easy to debug and monitor message flows.

---

## What Was Added

### 1. Incoming Message Logging (iMessage → Backend)

**Location:** `src/index.ts:222-227`

**Example Output:**
```
============================================================
📨 INCOMING MESSAGE from +15622924139
   Thread: iMessage;-;+15622924139
   Group: No
   Text: "Hey, how are you doing today?"
============================================================
⬆️  SENDING TO BACKEND: https://archety-backend-production.up.railway.app/edge/message
⬇️  BACKEND RESPONSE: should_respond=true
```

**Shows:**
- Sender phone number
- Thread ID
- Whether it's a group chat
- Full message text
- Backend endpoint being called
- Backend's response decision

---

### 2. Outgoing Message Logging (Backend → iMessage)

**Locations:**
- Reflex messages: `src/index.ts:248-251`
- Burst messages: `src/index.ts:272-276`
- Multi-bubble: `src/index.ts:295-299`
- Single response: `src/index.ts:316-318`

**Example Output:**

**Reflex (immediate response):**
```
------------------------------------------------------------
⚡ SENDING REFLEX MESSAGE to iMessage;-;+15622924139
   Text: "I'm doing great, thanks for asking!"
------------------------------------------------------------
✅ Reflex message DELIVERED to iMessage
```

**Burst messages (delayed):**
```
⏳ Will send 2 burst messages after 2000ms
   Burst messages: ["That's awesome!","How about you?"]
------------------------------------------------------------
📤 SENDING BURST MESSAGES to iMessage;-;+15622924139
   [1/2]: "That's awesome!"
   [2/2]: "How about you?"
------------------------------------------------------------
✅ All burst messages DELIVERED to iMessage
```

**Multi-bubble:**
```
------------------------------------------------------------
📤 SENDING 3 BUBBLES to iMessage;-;+15622924139
   [1/3]: "First part of response"
   [2/3]: "Second part"
   [3/3]: "Third part"
------------------------------------------------------------
✅ All bubbles DELIVERED to iMessage
```

---

### 3. WebSocket Command Logging

**Location:** `src/backend/WebSocketClient.ts:178-189`

**Example Output:**
```
============================================================
📥 WEBSOCKET COMMAND RECEIVED
   Command ID: cmd_1234567890
   Command Type: schedule_message
   Priority: immediate
   Timestamp: 2025-11-06T00:45:00Z
   Payload: {
     "thread_id": "+13238407486",
     "message_text": "Reminder: Call the dentist!",
     "send_at": "2025-11-06T14:00:00Z",
     "is_group": false
   }
============================================================
```

**Shows:**
- Command ID for tracking
- Command type
- Priority (if specified)
- Timestamp
- Full payload with all parameters

---

### 4. Command Acknowledgment Logging

**Location:** `src/backend/WebSocketClient.ts:291-298`

**Example Output:**
```
------------------------------------------------------------
📤 SENDING COMMAND ACK via WebSocket
   Command ID: cmd_1234567890
   Status: completed
------------------------------------------------------------
```

Or if failed:
```
------------------------------------------------------------
📤 SENDING COMMAND ACK via WebSocket
   Command ID: cmd_1234567890
   Status: failed
   Error: Invalid timestamp format
------------------------------------------------------------
```

---

### 5. Scheduled Message Logging

**Location:** `src/scheduler/Scheduler.ts:235-244`

**Example Output:**
```
============================================================
🔔 SENDING SCHEDULED MESSAGE
   Schedule ID: abc-123-def
   Thread: iMessage;-;+13238407486
   Scheduled for: 2025-11-06T14:00:00Z
   Text: "Reminder: Call the dentist!"
   Command ID: cmd_1234567890
============================================================
✅ Scheduled message abc-123-def sent successfully
```

**Shows:**
- Schedule ID (for tracking/cancellation)
- Thread where message is sent
- Originally scheduled time
- Full message text
- Associated command ID (if from backend)

---

## Log Format

### Visual Separators

- `=` (60 chars) - Major events (incoming messages, commands, scheduled sends)
- `-` (60 chars) - Sub-events (responses, acknowledgments)

### Icons

- 📨 Incoming iMessage
- ⬆️  Sending to backend (HTTP)
- ⬇️  Response from backend
- 📤 Sending outgoing iMessage
- ⚡ Reflex (immediate) message
- 🔔 Scheduled message
- 📥 WebSocket command received
- ✅ Success
- ❌ Failure
- ⏳ Delayed action
- ℹ️  Info

---

## Example Full Message Flow

Here's what you'll see in logs for a complete conversation:

```
============================================================
📨 INCOMING MESSAGE from +15622924139
   Thread: iMessage;-;+15622924139
   Group: No
   Text: "What's the weather like tomorrow?"
============================================================
⬆️  SENDING TO BACKEND: https://archety-backend-production.up.railway.app/edge/message
⬇️  BACKEND RESPONSE: should_respond=true
------------------------------------------------------------
⚡ SENDING REFLEX MESSAGE to iMessage;-;+15622924139
   Text: "Let me check that for you..."
------------------------------------------------------------
✅ Reflex message DELIVERED to iMessage
⏳ Will send 2 burst messages after 2000ms
   Burst messages: ["It looks like it'll be sunny!","High of 75°F"]
------------------------------------------------------------
📤 SENDING BURST MESSAGES to iMessage;-;+15622924139
   [1/2]: "It looks like it'll be sunny!"
   [2/2]: "High of 75°F"
------------------------------------------------------------
✅ All burst messages DELIVERED to iMessage
```

---

## Bug Fix: Batched Send for 1:1 Chats

**Issue:** Batched multi-bubble sends were failing for 1:1 (non-group) chats with error:
```
Could not resolve "to" parameter to a participant or chat!
```

**Cause:** AppleScript was trying to send to `targetChat` (a service object) instead of `targetBuddy` (the actual contact).

**Fix:** `src/transports/AppleScriptSender.ts:163-172`

Changed from:
```applescript
set targetChat to first service whose service type = iMessage
set targetBuddy to buddy "+15622924139" of targetChat
send "message" to targetChat  # ❌ WRONG
```

To:
```applescript
set targetService to 1st account whose service type = iMessage
set targetBuddy to participant "+15622924139" of targetService
send "message" to targetBuddy  # ✅ CORRECT
```

**Status:** ✅ Fixed and tested

---

## Viewing Logs

### Real-time monitoring:
```bash
tail -f edge-agent.log
```

### Filter by type:
```bash
# Incoming messages only
tail -f edge-agent.log | grep "📨 INCOMING"

# WebSocket commands only
tail -f edge-agent.log | grep "📥 WEBSOCKET"

# Scheduled messages only
tail -f edge-agent.log | grep "🔔 SENDING SCHEDULED"

# All outgoing messages
tail -f edge-agent.log | grep -E "📤|⚡|🔔"

# Errors only
tail -f edge-agent.log | grep "❌"
```

---

## Log Level

All new logging uses **INFO level**, making it visible by default without needing to change log configuration.

**Current config:**
```yaml
logging:
  level: "info"
  file: "./edge-agent.log"
```

---

## Files Modified

1. ✅ `src/index.ts` - Added incoming/outgoing message logging
2. ✅ `src/backend/WebSocketClient.ts` - Added WebSocket command logging
3. ✅ `src/scheduler/Scheduler.ts` - Added scheduled message logging
4. ✅ `src/transports/AppleScriptSender.ts` - Fixed batched send bug + logging already existed
5. ✅ `docs/LOGGING_ENHANCEMENTS.md` - This documentation

---

## Testing

**Status:** ✅ Built and deployed

To test, send a message to the edge agent and watch the logs:
```bash
tail -f edge-agent.log
```

You should see the complete flow from incoming message through backend processing to outgoing response.

---

## Benefits

1. **Easy Debugging** - See exactly what's happening at each step
2. **Message Tracking** - Full visibility into all message flows
3. **Performance Monitoring** - Can see timing between steps
4. **Error Diagnosis** - Clear indication of where failures occur
5. **Audit Trail** - Complete record of all messages sent/received

---

**Summary:** Complete visibility into all message flows with clear, emoji-enhanced logging at every step! 🎉
