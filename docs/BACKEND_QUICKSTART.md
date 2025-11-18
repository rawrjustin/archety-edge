# Backend WebSocket Implementation - Quick Start Guide

## TL;DR

The edge agent is ready and waiting for your WebSocket endpoint at:

```
wss://archety-backend-production.up.railway.app/edge/ws?edge_agent_id={edge_agent_id}
```

## What You Need to Build

A WebSocket endpoint that:
1. Accepts connections from edge agents (with authentication)
2. Pushes commands to edge agents in real-time
3. Receives command acknowledgments from edge agents

## Minimal Working Example (Node.js)

```typescript
import { WebSocketServer } from 'ws';

// 1. Create WebSocket server
const wss = new WebSocketServer({
  server: yourHttpServer,
  path: '/edge/ws'
});

// 2. Store active connections
const connections = new Map<string, WebSocket>();

// 3. Handle new connections
wss.on('connection', (ws, req) => {
  // Extract edge_agent_id from query params
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const edgeAgentId = url.searchParams.get('edge_agent_id');

  // Validate auth (check Bearer token in Authorization header)
  const authHeader = req.headers.authorization;
  if (!isValidAuth(authHeader, edgeAgentId)) {
    ws.close(4001, 'Unauthorized');
    return;
  }

  console.log(`Edge agent ${edgeAgentId} connected`);
  connections.set(edgeAgentId, ws);

  // Handle incoming messages
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());

    switch (msg.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong' }));
        break;

      case 'command_ack':
        handleCommandAck(edgeAgentId, msg.data);
        break;
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    console.log(`Edge agent ${edgeAgentId} disconnected`);
    connections.delete(edgeAgentId);
  });
});

// 4. Function to send commands to edge agents
function sendCommandToEdge(edgeAgentId: string, command: any): boolean {
  const ws = connections.get(edgeAgentId);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'command',
      data: {
        command_id: command.command_id,
        command_type: command.command_type,
        payload: command.payload,
        priority: command.priority || 'normal'
      }
    }));
    return true;
  }

  // Edge agent not connected - queue for HTTP polling
  return false;
}

// 5. Use it in your existing command logic
app.post('/api/send-message', async (req, res) => {
  const { edge_agent_id, thread_id, message } = req.body;

  const command = {
    command_id: generateId(),
    command_type: 'schedule_message',
    payload: {
      thread_id,
      message_text: message,
      send_at: new Date().toISOString()
    }
  };

  // Try WebSocket first
  const sent = sendCommandToEdge(edge_agent_id, command);

  if (sent) {
    console.log('Command sent via WebSocket (instant)');
  } else {
    console.log('WebSocket not available, queuing for HTTP polling');
    await queueCommandForPolling(edge_agent_id, command);
  }

  res.json({ success: true });
});
```

## Message Format

### Commands (Backend → Edge)

```json
{
  "type": "command",
  "data": {
    "command_id": "cmd_1234567890",
    "command_type": "schedule_message",
    "payload": {
      "thread_id": "+13105551234",
      "message_text": "Hello!",
      "send_at": "2025-11-05T20:00:00Z"
    },
    "priority": "normal"
  }
}
```

### Command Acknowledgment (Edge → Backend)

```json
{
  "type": "command_ack",
  "data": {
    "command_id": "cmd_1234567890",
    "success": true,
    "error": null,
    "timestamp": "2025-11-05T20:00:01Z"
  }
}
```

### Ping/Pong (Keepalive)

**Ping from edge:**
```json
{ "type": "ping" }
```

**Pong from backend:**
```json
{ "type": "pong" }
```

## Authentication

Edge agent sends:
- **Query param:** `edge_agent_id` (e.g., `edge_13238407486`)
- **Header:** `Authorization: Bearer {EDGE_SECRET}`
- **Header:** `X-Edge-Agent-Id: {edge_agent_id}`

Validate both the Bearer token and that the edge_agent_id exists in your database.

## ⚡ HTTP/WebSocket Correlation for Instant Reflex Delivery

**New Feature (November 17, 2025):** Edge client now sends `X-Edge-Agent-Id` header in HTTP requests so you can correlate them with WebSocket connections.

### The Problem

When a user sends a message:
1. Edge client POSTs to `/edge/message` (HTTP)
2. Backend generates a reflex response
3. Backend wants to send reflex instantly via WebSocket
4. **But which WebSocket?** Need to correlate HTTP request to WebSocket connection

### The Solution

Edge client now sends `X-Edge-Agent-Id` header in HTTP requests:

```http
POST /edge/message
Authorization: Bearer {EDGE_SECRET}
X-Edge-Agent-Id: edge_13238407486  ← Use this to look up WebSocket!
Content-Type: application/json

{
  "thread_id": "+15622924139",
  "sender": "+15622924139",
  "filtered_text": "Can you find me the best deal for a Mac mini?"
}
```

### Implementation Example

```typescript
// Store WebSocket connections keyed by edge_agent_id
const websocketConnections = new Map<string, WebSocket>();

// When WebSocket connects
wss.on('connection', (ws, req) => {
  const edgeAgentId = new URL(req.url, 'http://localhost').searchParams.get('edge_agent_id');
  websocketConnections.set(edgeAgentId, ws);  // Store it!

  ws.on('close', () => {
    websocketConnections.delete(edgeAgentId);  // Clean up
  });
});

// When HTTP request arrives
app.post('/edge/message', async (req, res) => {
  // Extract edge agent ID from header
  const edgeAgentId = req.headers['x-edge-agent-id'];

  // Process message and generate reflex
  const reflexText = await generateReflex(req.body);

  // Look up WebSocket connection
  const ws = websocketConnections.get(edgeAgentId);

  if (ws && ws.readyState === WebSocket.OPEN) {
    // Send reflex INSTANTLY via WebSocket
    ws.send(JSON.stringify({
      type: 'command',
      data: {
        command_id: uuidv4(),
        command_type: 'send_message_now',  // NEW command type
        payload: {
          thread_id: req.body.thread_id,
          text: reflexText,
          bubble_type: 'reflex'
        },
        priority: 'immediate',
        timestamp: new Date().toISOString()
      }
    }));

    console.log(`📤 Sent reflex via WebSocket to ${edgeAgentId}: ${reflexText}`);
  } else {
    console.log(`⚠️ WebSocket not found for ${edgeAgentId}, will return in HTTP response only`);
  }

  // Also return in HTTP response (fallback + remaining bubbles)
  res.json({
    should_respond: true,
    reply_bubbles: [reflexText, 'bubble 2', 'bubble 3', ...]
  });
});
```

### Edge Client Behavior

1. Receives `send_message_now` command via WebSocket → Sends reflex to iMessage **instantly** (<500ms)
2. Later receives HTTP response with all bubbles → **Skips first bubble** (already sent)
3. Result: User sees reflex immediately, then burst messages follow

### Debug Logging

Backend should log:
```
[WebSocket] Connected: edge_13238407486 (total: 1)
[HTTP POST] Received from edge_13238407486
[Reflex] WebSocket found for edge_13238407486 ✅
[Reflex] Sent "okie lemme see" via WebSocket to edge_13238407486
```

If WebSocket not found:
```
[HTTP POST] Received from edge_13238407486
[Reflex] WebSocket NOT found ❌ (will return in HTTP response only)
```

**See:** `docs/BACKEND_WEBSOCKET_CORRELATION.md` for complete implementation guide with Python examples.

## Testing the Implementation

### 1. Check Edge Agent Status

The edge agent is already running and attempting to connect. Check logs:

```bash
tail -f /Users/sage1/Code/edge-relay/edge-agent.log | grep WebSocket
```

You'll see connection attempts every few seconds.

### 2. Test Connection

Once you deploy, you should see in edge agent logs:

```
[INFO] Connecting to WebSocket: wss://archety-backend-production.up.railway.app/edge/ws?edge_agent_id=edge_13238407486
[INFO] ✅ WebSocket connected - real-time mode enabled
[INFO] 🔌 WebSocket connected - real-time command delivery enabled
```

### 3. Test Command Push

Send a command via WebSocket:

```typescript
sendCommandToEdge('edge_13238407486', {
  command_id: 'test_001',
  command_type: 'schedule_message',
  payload: {
    thread_id: '+13238407486',
    message_text: 'Test message from WebSocket!',
    send_at: new Date(Date.now() + 5000).toISOString() // 5 seconds from now
  }
});
```

Check edge agent logs for:
```
[INFO] 📥 Received command via WebSocket: test_001
[INFO] ✅ Command test_001 executed successfully
```

## Common Issues

### Issue: WebSocket connection refused
**Solution:** Make sure your HTTP server is passed to WebSocketServer and Railway allows WebSocket upgrades

### Issue: 403 Unauthorized
**Solution:** Check Authorization header validation - make sure you're reading the Bearer token correctly

### Issue: Connection drops frequently
**Solution:** Respond to ping messages with pong to maintain keepalive

## Performance Notes

- Edge agent pings every 30 seconds
- Edge agent reconnects with exponential backoff (1s, 2s, 4s, 8s... up to 60s)
- If WebSocket fails, HTTP polling continues as fallback (no downtime)

## Complete Documentation

For full details, see:
- **Full Spec:** `docs/BACKEND_WEBSOCKET_SPEC.md`
- **Summary:** `docs/WEBSOCKET_IMPLEMENTATION_SUMMARY.md`

## Support

- Edge agent implementation: `src/backend/WebSocketClient.ts`
- Edge agent integration: `src/index.ts`

---

**Current Status:** Edge agent ready and waiting for backend WebSocket endpoint
**Expected Result:** Commands delivered in <100ms instead of up to 15 seconds
