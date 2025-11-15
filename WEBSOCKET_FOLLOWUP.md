# WebSocket Follow-Up - Still Getting 403

**Date:** November 15, 2025
**Status:** 🟡 IN PROGRESS - Secret updated but still failing

---

## What We Did

✅ Updated `EDGE_SECRET` in `.env` to match your specification:
```bash
EDGE_SECRET=74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261
```

---

## Current Result

Still getting **403 Forbidden** from the dev backend:

```
❌ WebSocket Error:
   Message: Unexpected server response: 403

Configuration:
  Backend URL: https://archety-backend-dev.up.railway.app
  WebSocket URL: wss://archety-backend-dev.up.railway.app
  Edge Agent ID: edge_13238407486
  EDGE_SECRET: 74a0e606d739d31eda5d...

Connection Details:
  URL: wss://archety-backend-dev.up.railway.app/edge/ws?edge_agent_id=edge_13238407486
  Headers:
    Authorization: Bearer 74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261
    X-Edge-Agent-Id: edge_13238407486

WebSocket closed:
   Code: 1006 (Abnormal Closure)
```

---

## Questions for Backend Engineer

### 1. Is EDGE_SECRET Set on Railway Dev Environment?

Can you verify that the Railway **dev environment** has this exact secret configured?

```bash
# Check Railway environment variables
railway variables --environment development

# Should show:
EDGE_SECRET=74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261
```

### 2. Are We Connecting to the Right Environment?

We're connecting to:
```
wss://archety-backend-dev.up.railway.app/edge/ws
```

Is this the correct URL for the development environment where you set `EDGE_SECRET`?

### 3. Can You Check Backend Logs?

Please check Railway logs for our connection attempt around:
- **Timestamp:** 2025-11-15T06:40-06:45 (UTC)
- **Look for:** `edge_13238407486`

What does the backend log show when we try to connect?

Expected logs if auth is failing:
```
❌ WebSocket auth failed: token mismatch
❌ Invalid token for edge_agent_id=edge_13238407486
❌ EDGE_SECRET not set in environment
```

### 4. Is the Auth Check Working Correctly?

Can you verify the WebSocket auth code is checking:

```python
# Expected auth check
authorization = request.headers.get('Authorization')
if not authorization or not authorization.startswith('Bearer '):
    return 403

token = authorization.replace('Bearer ', '')
if token != os.getenv('EDGE_SECRET'):
    return 403  # ← We're getting here

# If we get here, auth should succeed
```

---

## What We're Sending (Confirmed)

```http
GET /edge/ws?edge_agent_id=edge_13238407486 HTTP/1.1
Host: archety-backend-dev.up.railway.app
Upgrade: websocket
Connection: Upgrade
Authorization: Bearer 74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261
X-Edge-Agent-Id: edge_13238407486
```

---

## Test Commands for Backend Team

### Verify EDGE_SECRET on Railway

```bash
# SSH into Railway or check env vars
railway variables --environment development | grep EDGE_SECRET

# Should output:
# EDGE_SECRET=74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261
```

### Check Railway Logs

```bash
railway logs --environment development --filter websocket

# Or
railway logs --environment development | grep -i "edge_13238407486"
```

### Test from Backend Side

Can you try connecting from your side with the same secret to verify the endpoint works?

```python
import websockets
import asyncio

async def test():
    uri = "wss://archety-backend-dev.up.railway.app/edge/ws?edge_agent_id=test_123"
    headers = {
        "Authorization": "Bearer 74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261"
    }
    async with websockets.connect(uri, extra_headers=headers) as ws:
        print("✅ Connected!")
        await ws.send('{"type":"ping"}')
        response = await ws.recv()
        print(f"📥 {response}")

asyncio.run(test())
```

---

## Possible Issues

1. **Railway env var not set:** EDGE_SECRET might not be configured on Railway dev
2. **Different secret on Railway:** Railway might have a different value than local `.env`
3. **Cached deployment:** Railway might need a redeploy to pick up new EDGE_SECRET
4. **Auth middleware bug:** Backend auth logic might have an issue
5. **Wrong environment:** We might be connecting to the wrong deployment

---

## Temporary Status

**HTTP API is working fine:**
```
✅ POST /orchestrator/message (with RELAY_WEBHOOK_SECRET)
✅ Messages being processed
✅ Graceful HTTP polling fallback
```

**WebSocket still failing:**
```
❌ Connection rejected with 403
❌ Falling back to HTTP polling
⚠️ Real-time commands unavailable
```

The edge client continues to function via HTTP polling.

---

## Next Steps

1. **Backend team:** Verify EDGE_SECRET is set on Railway dev environment
2. **Backend team:** Check logs for our connection attempts
3. **Backend team:** Confirm auth middleware is working
4. **Backend team:** Try connecting from your side with same secret
5. **Edge client:** Wait for confirmation before next test

---

**Created:** 2025-11-15
**Updated EDGE_SECRET:** ✅ Done
**Test Result:** ❌ Still 403
**Waiting for:** Backend environment verification
