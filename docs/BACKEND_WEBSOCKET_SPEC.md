# Backend WebSocket Implementation Specification

## Overview

This document specifies the WebSocket implementation requirements for real-time communication between the edge agent (Mac Mini) and the backend (Railway). This replaces the polling-based command delivery with instant push notifications.

## Benefits

- **Sub-second latency**: Commands arrive in <100ms instead of up to 15 seconds
- **Reduced server load**: No constant HTTP polling (15-second intervals)
- **Better resource usage**: Single persistent connection vs. repeated HTTP requests
- **Bidirectional**: Can push updates in both directions instantly
- **Connection awareness**: Backend knows when edge agents are online/offline

## Architecture

```
┌─────────────────┐         WebSocket          ┌──────────────────┐
│   Edge Agent    │◄───────────────────────────►│     Backend      │
│   (Mac Mini)    │    wss://backend/edge/ws    │    (Railway)     │
└─────────────────┘                             └──────────────────┘
        │                                               │
        │ 1. Connect with edge_agent_id                │
        ├──────────────────────────────────────────────►│
        │                                               │
        │ 2. Auth via Bearer token                     │
        │◄──────────────────────────────────────────────┤
        │                                               │
        │ 3. Receive commands in real-time             │
        │◄──────────────────────────────────────────────┤
        │    {"type": "command", "data": {...}}        │
        │                                               │
        │ 4. Send command acknowledgments              │
        ├──────────────────────────────────────────────►│
        │    {"type": "command_ack", "data": {...}}    │
        │                                               │
        │ 5. Heartbeat ping/pong                       │
        │◄─────────────────────────────────────────────►│
        │    {"type": "ping"} / {"type": "pong"}       │
```

## WebSocket Endpoint

### URL

```
wss://your-backend.railway.app/edge/ws
```

### Query Parameters

- **`edge_agent_id`** (required): The unique identifier for this edge agent
  - Example: `edge_13106781670`
  - Set after successful registration via `/edge/register`

### Headers

- **`Authorization`** (required): Bearer token with shared secret
  - Format: `Bearer {EDGE_SECRET}`
- **`X-Edge-Agent-Id`** (optional): Duplicate of query param for routing

### Example Connection

```
wss://archety-backend-production.up.railway.app/edge/ws?edge_agent_id=edge_13106781670

Headers:
  Authorization: Bearer 74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261
  X-Edge-Agent-Id: edge_13106781670
```

## Message Protocol

All messages are JSON with a `type` field and optional `data` field.

### Message Format

```typescript
interface WebSocketMessage {
  type: string;           // Message type
  data?: any;            // Optional payload
  timestamp?: string;    // ISO 8601 timestamp (optional)
}
```

## Message Types

### 1. Command (Backend → Edge)

Push a command to the edge agent for execution.

```json
{
  "type": "command",
  "data": {
    "command_id": "cmd_1234567890",
    "command_type": "send_message",
    "parameters": {
      "thread_id": "+13105551234",
      "message": "Hello from backend!",
      "schedule_time": null
    },
    "priority": "normal"
  }
}
```

**Fields:**
- `command_id`: Unique identifier for tracking
- `command_type`: One of: `send_message`, `schedule_message`, `cancel_message`, `update_config`
- `parameters`: Command-specific parameters
- `priority`: `normal` | `high` | `low`

### 2. Command Acknowledgment (Edge → Backend)

Edge agent confirms command receipt and execution status.

```json
{
  "type": "command_ack",
  "data": {
    "command_id": "cmd_1234567890",
    "success": true,
    "error": null,
    "timestamp": "2025-11-05T20:30:00.000Z"
  }
}
```

**Fields:**
- `command_id`: ID of the command being acknowledged
- `success`: Boolean indicating if command executed successfully
- `error`: Error message if `success` is false, otherwise null
- `timestamp`: When the command was processed

### 3. Ping/Pong (Bidirectional)

Keepalive heartbeat to detect disconnections.

**Ping (Edge → Backend):**
```json
{
  "type": "ping"
}
```

**Pong (Backend → Edge):**
```json
{
  "type": "pong"
}
```

**Frequency:** Edge agent sends ping every 30 seconds

### 4. Config Update (Backend → Edge)

Push configuration changes to edge agent.

```json
{
  "type": "config_update",
  "data": {
    "sync_interval": 60,
    "log_level": "info"
  }
}
```

### 5. Status Update (Edge → Backend)

Periodic status reports from edge agent (optional).

```json
{
  "type": "status",
  "data": {
    "scheduled_messages": 3,
    "uptime_seconds": 3600,
    "memory_usage_mb": 45
  }
}
```

## Connection Management

### Connection Establishment

1. **Edge agent initiates connection** with edge_agent_id and auth headers
2. **Backend validates** authentication and edge_agent_id
3. **Backend stores** connection in registry: `Map<edge_agent_id, WebSocket>`
4. **Backend sends** welcome/ready message (optional)

### Connection Registry

Backend should maintain an in-memory registry of active connections:

```typescript
class ConnectionRegistry {
  private connections: Map<string, WebSocket> = new Map();

  register(edgeAgentId: string, ws: WebSocket): void {
    this.connections.set(edgeAgentId, ws);
    console.log(`Edge agent ${edgeAgentId} connected`);
  }

  unregister(edgeAgentId: string): void {
    this.connections.delete(edgeAgentId);
    console.log(`Edge agent ${edgeAgentId} disconnected`);
  }

  send(edgeAgentId: string, message: any): boolean {
    const ws = this.connections.get(edgeAgentId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  isConnected(edgeAgentId: string): boolean {
    const ws = this.connections.get(edgeAgentId);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }
}
```

### Reconnection Handling

Edge agent implements **exponential backoff**:
- Initial delay: 1 second
- Max delay: 60 seconds
- Max attempts: 10
- Backoff formula: `delay * 2^(attempt - 1)`

Backend should:
- Accept reconnections from same edge_agent_id
- Clear old connection when new one established
- Track connection history for monitoring

### Disconnection

**Normal shutdown:**
1. Edge agent sends close frame
2. Backend removes from registry
3. Connection closed cleanly

**Abnormal disconnection:**
1. Backend detects missing ping (timeout after 60s)
2. Backend removes from registry
3. Edge agent auto-reconnects with backoff

## Fallback Behavior

### HTTP Polling Fallback

If WebSocket connection fails or drops:
1. Edge agent falls back to HTTP polling (`POST /edge/sync`)
2. Polls every 15 seconds (configurable)
3. Continues attempting WebSocket reconnection in background
4. Switches back to WebSocket when available

### Command Delivery Guarantee

Backend should:
1. **Try WebSocket first** if edge agent is connected
2. **Queue commands** if WebSocket fails to deliver
3. **Deliver via HTTP** when edge agent polls
4. **Retry** failed commands with exponential backoff

## Security

### Authentication

- **Shared secret** (HMAC-based or Bearer token)
- **Edge agent ID** validation against database
- **TLS/SSL** required (wss://, not ws://)

### Authorization

- Edge agents can only receive commands for their own `edge_agent_id`
- Backend must validate ownership before pushing commands

### Rate Limiting

Suggested limits per edge agent:
- **Connection attempts**: 10 per minute
- **Messages sent**: 100 per minute
- **Ping frequency**: Max 1 per 10 seconds

## Monitoring & Observability

### Metrics to Track

1. **Connection metrics:**
   - Active connections count
   - Connection duration average
   - Reconnection attempts
   - Failed connection attempts

2. **Message metrics:**
   - Commands sent per minute
   - Command acknowledgment rate
   - Average command latency
   - Failed deliveries

3. **Health metrics:**
   - Ping/pong success rate
   - Timeout disconnections
   - Abnormal disconnections

### Logging

**Log on connection:**
```
[INFO] Edge agent edge_13106781670 connected from IP 1.2.3.4
```

**Log on command sent:**
```
[INFO] Sent command cmd_1234567890 to edge_13106781670 (type: send_message)
```

**Log on disconnection:**
```
[WARN] Edge agent edge_13106781670 disconnected (duration: 3600s)
```

## Implementation Checklist

### Backend Tasks

- [ ] **WebSocket server setup**
  - [ ] Install WebSocket library (e.g., `ws` for Node.js, or framework-native)
  - [ ] Create `/edge/ws` endpoint
  - [ ] Handle upgrade from HTTP to WebSocket

- [ ] **Authentication & authorization**
  - [ ] Validate Bearer token from Authorization header
  - [ ] Validate edge_agent_id from query params
  - [ ] Check edge agent exists in database

- [ ] **Connection registry**
  - [ ] Implement connection storage (Map or Redis)
  - [ ] Register connections on connect
  - [ ] Unregister on disconnect
  - [ ] Handle duplicate connections (close old, keep new)

- [ ] **Message handling**
  - [ ] Parse incoming JSON messages
  - [ ] Route by message type
  - [ ] Handle ping/pong
  - [ ] Handle command acknowledgments
  - [ ] Send commands to edge agents

- [ ] **Command delivery**
  - [ ] Check if edge agent is connected via WebSocket
  - [ ] Push command via WebSocket if connected
  - [ ] Queue command for HTTP polling if not connected
  - [ ] Track delivery status

- [ ] **Error handling**
  - [ ] Handle malformed JSON
  - [ ] Handle unknown message types
  - [ ] Handle disconnections gracefully
  - [ ] Log errors with context

- [ ] **Monitoring**
  - [ ] Track active connections
  - [ ] Log connection events
  - [ ] Track command delivery metrics
  - [ ] Set up alerts for failures

### Testing

- [ ] **Unit tests**
  - [ ] Connection authentication
  - [ ] Message parsing
  - [ ] Command routing

- [ ] **Integration tests**
  - [ ] Full connection lifecycle
  - [ ] Command delivery
  - [ ] Reconnection handling
  - [ ] Fallback to HTTP polling

- [ ] **Load tests**
  - [ ] Multiple concurrent connections
  - [ ] High message throughput
  - [ ] Connection churn

## Example Implementation (Node.js + ws)

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

class EdgeWebSocketServer {
  private wss: WebSocketServer;
  private connections: Map<string, WebSocket> = new Map();

  constructor(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: '/edge/ws'
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });
  }

  private async handleConnection(ws: WebSocket, req: any) {
    // Extract edge_agent_id from query params
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const edgeAgentId = url.searchParams.get('edge_agent_id');

    // Validate authentication
    const authHeader = req.headers.authorization;
    if (!this.validateAuth(authHeader, edgeAgentId)) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    // Register connection
    this.connections.set(edgeAgentId!, ws);
    console.log(`Edge agent ${edgeAgentId} connected`);

    // Set up message handler
    ws.on('message', (data) => {
      this.handleMessage(edgeAgentId!, data);
    });

    // Handle disconnection
    ws.on('close', () => {
      this.connections.delete(edgeAgentId!);
      console.log(`Edge agent ${edgeAgentId} disconnected`);
    });

    // Send welcome message
    this.send(edgeAgentId!, {
      type: 'connected',
      data: { message: 'WebSocket connected' }
    });
  }

  private handleMessage(edgeAgentId: string, data: any) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'ping':
          this.send(edgeAgentId, { type: 'pong' });
          break;

        case 'command_ack':
          this.handleCommandAck(edgeAgentId, message.data);
          break;

        default:
          console.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  public sendCommand(edgeAgentId: string, command: any): boolean {
    return this.send(edgeAgentId, {
      type: 'command',
      data: command
    });
  }

  private send(edgeAgentId: string, message: any): boolean {
    const ws = this.connections.get(edgeAgentId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  private validateAuth(authHeader: string | undefined, edgeAgentId: string | null): boolean {
    // Implement your authentication logic
    // Check Bearer token, validate edge_agent_id exists in DB
    return true; // Placeholder
  }

  private handleCommandAck(edgeAgentId: string, ackData: any) {
    // Update command status in database
    console.log(`Command ${ackData.command_id} acknowledged by ${edgeAgentId}`);
  }

  public isConnected(edgeAgentId: string): boolean {
    const ws = this.connections.get(edgeAgentId);
    return ws !== undefined && ws.readyState === WebSocket.OPEN;
  }
}

// Usage
const httpServer = createServer(app);
const wsServer = new EdgeWebSocketServer(httpServer);

// Send command to edge agent
wsServer.sendCommand('edge_13106781670', {
  command_id: 'cmd_123',
  command_type: 'send_message',
  parameters: {
    thread_id: '+13105551234',
    message: 'Hello!'
  }
});
```

## Migration Strategy

### Phase 1: Parallel Operation (Week 1)
- Implement WebSocket endpoint
- Edge agents connect to WebSocket
- Commands sent via both WebSocket AND HTTP
- Monitor WebSocket delivery success rate

### Phase 2: WebSocket Primary (Week 2)
- WebSocket becomes primary delivery method
- HTTP polling as fallback only
- Monitor for issues

### Phase 3: Optimize HTTP Polling (Week 3)
- Increase HTTP polling interval (30s → 60s)
- Reduce server load from polling
- HTTP only for fallback cases

## Questions & Support

For questions about this specification or implementation support:
- Edge agent repository: `/Users/sage1/Code/edge-relay`
- Edge agent implementation: `src/backend/WebSocketClient.ts`
- Contact: [Your contact information]

---

**Document Version:** 1.0
**Last Updated:** November 5, 2025
**Author:** Edge Agent Team
