# WebSocket Connection - Quick Fix

**Issue:** WebSocket connection failing
**Time to Fix:** 2 minutes

---

## The Problem

Your WebSocket connection is failing because it's missing the `Authorization` header.

```
❌ [2025-11-15T06:31:11.278Z] [INFO] Attempting WebSocket reconnect (attempt #8)
```

---

## The Fix

### Step 1: Add Authorization Header

```typescript
// ❌ OLD CODE (Missing auth)
const ws = new WebSocket(
  `wss://archety-backend-dev.up.railway.app/edge/ws?edge_agent_id=edge_13238407486`
);

// ✅ NEW CODE (With auth)
const EDGE_SECRET = process.env.EDGE_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION";

const ws = new WebSocket(
  `wss://archety-backend-dev.up.railway.app/edge/ws?edge_agent_id=edge_13238407486`,
  {
    headers: {
      'Authorization': `Bearer ${EDGE_SECRET}`
    }
  }
);
```

### Step 2: Set Environment Variable

```bash
# For development, use the default secret:
export EDGE_SECRET="CHANGE_THIS_SECRET_IN_PRODUCTION"

# Or add to your .env file:
echo 'EDGE_SECRET="CHANGE_THIS_SECRET_IN_PRODUCTION"' >> .env
```

### Step 3: Verify Connection

```bash
# Run your edge client
npm start

# You should see:
✅ WebSocket connected!
```

---

## For Production

**Generate a secure secret:**

```bash
# Generate a secure secret
openssl rand -hex 32

# Example output:
# f8d7e6c5b4a39281706f5e4d3c2b1a09e8d7c6b5a4938271605f4e3d2c1b0a

# Add to your .env:
EDGE_SECRET="f8d7e6c5b4a39281706f5e4d3c2b1a09e8d7c6b5a4938271605f4e3d2c1b0a"
```

**Share with backend engineer to set on Railway:**

```bash
# Backend engineer will add this to Railway:
EDGE_SECRET="f8d7e6c5b4a39281706f5e4d3c2b1a09e8d7c6b5a4938271605f4e3d2c1b0a"
```

---

## Complete Example (JavaScript)

```javascript
const WebSocket = require('ws');

const EDGE_SECRET = process.env.EDGE_SECRET || "CHANGE_THIS_SECRET_IN_PRODUCTION";
const EDGE_AGENT_ID = "edge_13238407486";
const BACKEND_URL = "wss://archety-backend-dev.up.railway.app";

function connect() {
  const ws = new WebSocket(
    `${BACKEND_URL}/edge/ws?edge_agent_id=${EDGE_AGENT_ID}`,
    {
      headers: {
        'Authorization': `Bearer ${EDGE_SECRET}`
      }
    }
  );

  ws.on('open', () => {
    console.log('✅ WebSocket connected!');

    // Send periodic pings
    setInterval(() => {
      ws.send(JSON.stringify({ type: 'ping' }));
    }, 30000);
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📥 Received:', message.type);

    if (message.type === 'command') {
      handleCommand(message.payload);
    }
  });

  ws.on('error', (error) => {
    console.error('❌ Error:', error.message);
  });

  ws.on('close', (code, reason) => {
    console.log(`🔌 Closed: ${code} ${reason}`);
    setTimeout(connect, 5000); // Reconnect after 5s
  });
}

function handleCommand(payload) {
  console.log('📨 Command:', payload.command_type);
  // Implement command handling (send iMessage, etc.)
}

connect();
```

---

## Test It

```bash
# Run your updated edge client
EDGE_SECRET="CHANGE_THIS_SECRET_IN_PRODUCTION" npm start

# Expected output:
[INFO] Connecting to WebSocket: wss://...
✅ WebSocket connected!
📥 Received: pong
```

---

## Full Documentation

For complete details: [WEBSOCKET_SETUP_GUIDE.md](./WEBSOCKET_SETUP_GUIDE.md)

---

**Status:** 🟢 Quick fix available
**Time:** 2 minutes
