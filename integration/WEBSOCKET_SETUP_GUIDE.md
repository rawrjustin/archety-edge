# WebSocket Connection Setup Guide

**For:** Edge Client Engineer
**Issue:** WebSocket connection failing
**Status:** 🔴 CRITICAL - Authentication Required

---

## Problem

The edge client is attempting to connect to the WebSocket but failing:

```
[2025-11-15T06:31:11.278Z] [INFO] Connecting to WebSocket: wss://archety-backend-dev.up.railway.app/edge/ws?edge_agent_id=edge_13238407486
```

**Root Cause:** Missing `Authorization` header in WebSocket connection

---

## Solution

The WebSocket endpoint requires authentication via the `Authorization` header with the `EDGE_SECRET`.

### 1. Get the EDGE_SECRET

**Option A: Reuse the HTTP secret (Simple)**

The backend accepts the `EDGE_SECRET` as a simple Bearer token for WebSocket authentication. For MVP, you can use the same secret you're already using for HTTP requests:

```bash
# In your .env
EDGE_SECRET="your-shared-secret-here"  # Same secret used for HTTP auth
```

**Option B: Generate a separate EDGE_SECRET (Recommended for production)**

```bash
# Generate a separate secret for WebSocket auth
openssl rand -hex 32
```

---

## 2. Add Authorization Header to WebSocket Connection

### JavaScript/TypeScript (ws library)

```typescript
import WebSocket from 'ws';

const EDGE_SECRET = process.env.EDGE_SECRET;
const EDGE_AGENT_ID = "edge_13238407486";
const BACKEND_URL = "wss://archety-backend-dev.up.railway.app";

const ws = new WebSocket(
  `${BACKEND_URL}/edge/ws?edge_agent_id=${EDGE_AGENT_ID}`,
  {
    headers: {
      'Authorization': `Bearer ${EDGE_SECRET}`,
      'X-Edge-Agent-Id': EDGE_AGENT_ID
    }
  }
);

ws.on('open', () => {
  console.log('✅ WebSocket connected!');

  // Send ping to keep connection alive
  setInterval(() => {
    ws.send(JSON.stringify({ type: 'ping' }));
  }, 30000); // Ping every 30 seconds
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('📥 Received message:', message);

  if (message.type === 'pong') {
    console.log('🏓 Pong received');
  } else if (message.type === 'command') {
    console.log('📨 Command received:', message.payload);
    handleCommand(message.payload);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 WebSocket closed: ${code} ${reason}`);
  // Implement reconnection logic
  setTimeout(() => reconnect(), 5000);
});
```

### Python (websockets library)

```python
import websockets
import asyncio
import json
import os

EDGE_SECRET = os.getenv("EDGE_SECRET")
EDGE_AGENT_ID = "edge_13238407486"
BACKEND_URL = "wss://archety-backend-dev.up.railway.app"

async def connect_websocket():
    uri = f"{BACKEND_URL}/edge/ws?edge_agent_id={EDGE_AGENT_ID}"

    headers = {
        "Authorization": f"Bearer {EDGE_SECRET}",
        "X-Edge-Agent-Id": EDGE_AGENT_ID
    }

    async with websockets.connect(uri, extra_headers=headers) as websocket:
        print("✅ WebSocket connected!")

        # Start ping task
        asyncio.create_task(send_pings(websocket))

        # Listen for messages
        async for message in websocket:
            data = json.loads(message)
            print(f"📥 Received: {data}")

            if data['type'] == 'pong':
                print("🏓 Pong received")
            elif data['type'] == 'command':
                print(f"📨 Command: {data['payload']}")
                await handle_command(data['payload'])

async def send_pings(websocket):
    while True:
        await asyncio.sleep(30)
        await websocket.send(json.dumps({"type": "ping"}))
```

---

## 3. Backend Configuration

**The backend engineer needs to set the EDGE_SECRET environment variable on Railway:**

```bash
# Railway environment variable
EDGE_SECRET="your-shared-secret-here"
```

**Important:** The EDGE_SECRET on the backend MUST match the EDGE_SECRET in your edge client!

---

## 4. WebSocket Protocol

### Connection Flow

1. **Client → Server:** WebSocket connection with `Authorization` header
2. **Server:** Validates token and accepts connection
3. **Client → Server:** Periodic `ping` messages (every 30s)
4. **Server → Client:** `pong` responses
5. **Server → Client:** `command` messages for scheduled messages
6. **Client → Server:** `command_ack` to acknowledge receipt

### Message Types

#### Client → Server

**Ping (Keep-Alive):**
```json
{
  "type": "ping"
}
```

**Command Acknowledgment:**
```json
{
  "type": "command_ack",
  "data": {
    "command_id": "cmd_abc123",
    "status": "completed"
  }
}
```

#### Server → Client

**Pong:**
```json
{
  "type": "pong"
}
```

**Command (Schedule Message):**
```json
{
  "type": "command",
  "payload": {
    "command_id": "msg_xyz789",
    "command_type": "schedule_message",
    "payload": {
      "thread_id": "iMessage;-;+15551234567",
      "message_text": "hey! just checking in 💙",
      "send_at": "2025-11-15T18:30:00Z",
      "is_group": false,
      "priority": "immediate"
    },
    "timestamp": "2025-11-15T06:31:11Z"
  }
}
```

---

## 5. Testing the Connection

### Test with curl (HTTP upgrade)

```bash
# Note: curl doesn't support WebSocket well, use websocat instead
brew install websocat

# Test WebSocket connection
websocat \
  -H "Authorization: Bearer $EDGE_SECRET" \
  -H "X-Edge-Agent-Id: edge_13238407486" \
  "wss://archety-backend-dev.up.railway.app/edge/ws?edge_agent_id=edge_13238407486"

# Once connected, send a ping:
{"type":"ping"}
```

### Test with Node.js

```bash
# Install ws library
npm install ws

# Create test_websocket.js:
cat > test_websocket.js << 'EOF'
const WebSocket = require('ws');

const EDGE_SECRET = process.env.EDGE_SECRET || 'your-secret-here';
const EDGE_AGENT_ID = "edge_13238407486";
const BACKEND_URL = "wss://archety-backend-dev.up.railway.app";

const ws = new WebSocket(
  `${BACKEND_URL}/edge/ws?edge_agent_id=${EDGE_AGENT_ID}`,
  {
    headers: {
      'Authorization': `Bearer ${EDGE_SECRET}`,
      'X-Edge-Agent-Id': EDGE_AGENT_ID
    }
  }
);

ws.on('open', () => {
  console.log('✅ WebSocket connected!');

  // Send a ping
  ws.send(JSON.stringify({ type: 'ping' }));
});

ws.on('message', (data) => {
  console.log('📥 Received:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 Closed: ${code} ${reason}`);
});
EOF

# Run it
EDGE_SECRET=your-secret-here node test_websocket.js
```

**Expected Output:**
```
✅ WebSocket connected!
📥 Received: {"type":"pong"}
```

---

## 6. Common Errors

### Error: Connection closed with code 4001

**Cause:** Missing or invalid `Authorization` header

**Solution:**
```typescript
// Make sure Authorization header is present and starts with "Bearer "
headers: {
  'Authorization': `Bearer ${EDGE_SECRET}`  // ✅ Correct
  // NOT: 'Authorization': EDGE_SECRET        // ❌ Wrong
}
```

### Error: Connection closed with code 1008

**Cause:** Token verification failed (EDGE_SECRET doesn't match backend)

**Solution:**
1. Check that EDGE_SECRET is set in your .env
2. Confirm with backend engineer that EDGE_SECRET matches on Railway
3. Check for extra whitespace in the secret

### Error: WebSocket connection timeout

**Cause:** Backend not reachable or wrong URL

**Solution:**
```typescript
// Check URL format (wss:// for HTTPS, ws:// for HTTP)
const BACKEND_URL = "wss://archety-backend-dev.up.railway.app";  // ✅ Correct
// NOT: "https://..."  // ❌ Wrong - use wss:// not https://
```

### Backend Logs Show "Missing Authorization header"

**Cause:** WebSocket library not sending custom headers correctly

**Solution:**
```typescript
// Some WebSocket libraries require extra_headers instead of headers
const ws = new WebSocket(url, {
  headers: { ... }  // Works with 'ws' library in Node.js
});

// Python websockets library:
await websockets.connect(uri, extra_headers=headers)
```

---

## 7. Reconnection Logic

Always implement exponential backoff for reconnections:

```typescript
class WebSocketClient {
  private reconnectAttempts = 0;
  private maxReconnectDelay = 60000; // 1 minute

  connect() {
    const ws = new WebSocket(this.url, {
      headers: {
        'Authorization': `Bearer ${this.edgeSecret}`,
        'X-Edge-Agent-Id': this.edgeAgentId
      }
    });

    ws.on('open', () => {
      console.log('✅ Connected');
      this.reconnectAttempts = 0; // Reset on successful connection
    });

    ws.on('close', (code, reason) => {
      console.log(`🔌 Disconnected: ${code} ${reason}`);
      this.reconnect();
    });

    ws.on('error', (error) => {
      console.error('❌ Error:', error.message);
    });
  }

  reconnect() {
    this.reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s
    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    console.log(`⏳ Reconnecting in ${delay/1000}s (attempt #${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }
}
```

---

## 8. Environment Variables Summary

**Edge Client (.env):**
```bash
# Backend connection
BACKEND_URL=wss://archety-backend-dev.up.railway.app

# Authentication (MUST match backend)
EDGE_SECRET=your-shared-secret-here

# Edge agent ID
EDGE_AGENT_ID=edge_13238407486
```

**Backend (Railway environment variables):**
```bash
# WebSocket + HTTP authentication
EDGE_SECRET=your-shared-secret-here  # MUST match edge client
```

---

## 9. Next Steps After WebSocket Works

Once you have WebSocket connected:

1. **Implement command handling:**
   - Receive `schedule_message` commands
   - Send messages via iMessage
   - Acknowledge with `command_ack`

2. **Implement keepalive:**
   - Send `ping` every 30 seconds
   - Handle `pong` responses
   - Detect connection failures

3. **Handle graceful shutdown:**
   - Close WebSocket on app exit
   - Send final status update
   - Clean up resources

---

## 10. Support

**Backend Engineer:** Engineer 2
**Backend Logs:** Check Railway dashboard for WebSocket connection logs
**Test Endpoint:** wss://archety-backend-dev.up.railway.app/edge/ws

**Common Log Messages to Look For:**

Backend success:
```
✅ WebSocket connection established for edge_13238407486
✅ Edge agent edge_13238407486 registered with WebSocket manager
```

Backend failure:
```
❌ WebSocket connection rejected: missing auth header
❌ Token verification failed for edge_agent_id=edge_13238407486
```

---

**Document Version:** 1.0
**Last Updated:** November 15, 2025
**Status:** Active - Critical Fix
