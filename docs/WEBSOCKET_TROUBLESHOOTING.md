# WebSocket Connection Troubleshooting

## Current Issue: 403 Unauthorized

The edge agent is attempting to connect but receiving `403` errors:

```
[INFO] Connecting to WebSocket: wss://archety-backend-production.up.railway.app/edge/ws?edge_agent_id=edge_13238407486
[ERROR] WebSocket error: ["Unexpected server response: 403"]
```

## What the Edge Agent is Sending

### Connection URL
```
wss://archety-backend-production.up.railway.app/edge/ws?edge_agent_id=edge_13238407486
```

### Headers
```
Authorization: Bearer 74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261
X-Edge-Agent-Id: edge_13238407486
```

### Edge Agent Details
- **Edge Agent ID:** `edge_13238407486`
- **User Phone:** `+13238407486`
- **Secret:** `74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261`

## Common Causes of 403 Error

### 1. Missing Authorization Header Check

The backend WebSocket handler might not be reading the `Authorization` header correctly.

**Check:**
```typescript
wss.on('connection', (ws, req) => {
  const authHeader = req.headers.authorization;
  console.log('Auth header:', authHeader); // Debug log

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    ws.close(4001, 'Missing or invalid Authorization header');
    return;
  }

  const token = authHeader.substring(7); // Remove 'Bearer '
  // Validate token...
});
```

### 2. Token Validation Logic

The backend might be validating the token incorrectly.

**Check:**
```typescript
const expectedSecret = process.env.EDGE_SECRET; // Should be the same as edge agent
if (token !== expectedSecret) {
  console.log('Token mismatch:', { received: token, expected: expectedSecret });
  ws.close(4001, 'Invalid token');
  return;
}
```

### 3. Edge Agent ID Not Found

The backend might be checking if `edge_13238407486` exists in the database.

**Check:**
```typescript
const edgeAgent = await db.findEdgeAgent(edgeAgentId);
if (!edgeAgent) {
  console.log('Edge agent not found:', edgeAgentId);
  ws.close(4001, 'Edge agent not registered');
  return;
}
```

### 4. WebSocket Upgrade Not Allowed

Railway or your server might not be properly configured for WebSocket upgrades.

**Check:**
```typescript
// Make sure WebSocket server is attached to HTTP server
const wss = new WebSocketServer({
  server: httpServer,  // Must be your HTTP server instance
  path: '/edge/ws'
});

// NOT a separate port
```

### 5. CORS or Proxy Issues

Railway might be blocking WebSocket connections.

**Check Railway settings:**
- Ensure WebSocket support is enabled
- Check if there are any proxy settings blocking upgrades

## Debugging Steps for Backend Engineer

### Step 1: Add Debug Logging

```typescript
wss.on('connection', (ws, req) => {
  console.log('=== WebSocket Connection Attempt ===');
  console.log('URL:', req.url);
  console.log('Headers:', req.headers);
  console.log('Authorization:', req.headers.authorization);
  console.log('X-Edge-Agent-Id:', req.headers['x-edge-agent-id']);

  // ... rest of your code
});

wss.on('upgrade', (req, socket, head) => {
  console.log('WebSocket upgrade requested for:', req.url);
});
```

### Step 2: Test with Minimal Handler

Replace your current handler temporarily with this minimal version:

```typescript
wss.on('connection', (ws, req) => {
  console.log('WebSocket connected successfully!');
  ws.send(JSON.stringify({ type: 'connected', message: 'Hello from backend!' }));
});
```

If this works, the issue is in your authentication logic.

### Step 3: Check Environment Variables

Ensure your backend has the same secret:

```bash
# Backend environment
EDGE_SECRET=74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261
```

### Step 4: Verify Edge Agent Registration

Check if `edge_13238407486` is registered in your database:

```sql
SELECT * FROM edge_agents WHERE edge_agent_id = 'edge_13238407486';
```

Or via your API:
```bash
curl https://archety-backend-production.up.railway.app/edge/agents/edge_13238407486 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Expected Behavior (When Working)

### Edge Agent Logs (Success)
```
[INFO] Connecting to WebSocket: wss://archety-backend-production.up.railway.app/edge/ws?edge_agent_id=edge_13238407486
[INFO] ✅ WebSocket connected - real-time mode enabled
[INFO] 🔌 WebSocket connected - real-time command delivery enabled
[INFO] Command delivery: Real-time via WebSocket 🚀
```

### Backend Logs (Success)
```
WebSocket upgrade requested for: /edge/ws?edge_agent_id=edge_13238407486
Edge agent edge_13238407486 connected
Active connections: 1
```

## Quick Test Command

You can test the WebSocket endpoint from command line:

```bash
# Install wscat if needed
npm install -g wscat

# Test connection
wscat -c "wss://archety-backend-production.up.railway.app/edge/ws?edge_agent_id=edge_13238407486" \
  -H "Authorization: Bearer 74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261"
```

**Expected:** Connection succeeds and you can send/receive messages
**Current:** Likely shows 403 error

## Temporary Workaround

If you need time to debug, you can temporarily disable WebSocket on the edge agent:

```yaml
# config.yaml
websocket:
  enabled: false  # Disable WebSocket temporarily
```

This will make the edge agent use HTTP polling exclusively (every 30 seconds).

## Contact Information

**Edge Agent Details:**
- Location: Mac Mini at `/Users/sage1/Code/edge-relay`
- Logs: `tail -f edge-agent.log | grep WebSocket`
- Config: `config.yaml`
- Secret: `74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261`

**Backend Details:**
- URL: `https://archety-backend-production.up.railway.app`
- WebSocket Path: `/edge/ws`
- Expected Protocol: See `docs/BACKEND_WEBSOCKET_SPEC.md`

## Next Steps

1. **Backend engineer:** Add debug logging to WebSocket handler
2. **Backend engineer:** Check Railway WebSocket configuration
3. **Backend engineer:** Verify edge agent registration in database
4. **Backend engineer:** Share backend logs showing the connection attempt

Once the 403 is resolved, the edge agent will automatically connect and start using real-time communication!
