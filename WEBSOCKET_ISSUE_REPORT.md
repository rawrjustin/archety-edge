# WebSocket Connection Issue - Diagnostic Report

**Date:** November 15, 2025
**Edge Client:** Mac Mini (edge_13238407486)
**Backend:** Railway (archety-backend-dev.up.railway.app)
**Status:** 🔴 FAILING - WebSocket endpoint not accessible

---

## Issue Summary

The edge client cannot establish WebSocket connections to the backend. Testing shows the `/edge/ws` endpoint returns **404 Not Found**.

---

## Error Details

### From Edge Client Logs

```
[2025-11-15T06:38:44.699Z] [ERROR] WebSocket error: ["Unexpected server response: 403"]
[2025-11-15T06:38:44.700Z] [WARN] WebSocket closed: code=1006, reason=Unknown
```

### From Diagnostic Test

```
❌ WebSocket Error:
   Message: Unexpected server response: 404

Connection Details:
  URL: wss://archety-backend-dev.up.railway.app/edge/ws?edge_agent_id=edge_13238407486
  Headers:
    Authorization: Bearer b3c7ddc616a155d9190252454fd82d1be3c9840dc5a0937defb78d948af70d81
    X-Edge-Agent-Id: edge_13238407486

WebSocket closed:
   Code: 1006 (Abnormal Closure)
```

---

## What We're Sending

### Connection Request

**WebSocket URL:**
```
wss://archety-backend-dev.up.railway.app/edge/ws?edge_agent_id=edge_13238407486
```

**Headers:**
```http
Authorization: Bearer b3c7ddc616a155d9190252454fd82d1be3c9840dc5a0937defb78d948af70d81
X-Edge-Agent-Id: edge_13238407486
```

**Query Parameters:**
```
edge_agent_id=edge_13238407486
```

---

## Questions for Backend Engineer

### 1. Does the WebSocket endpoint exist?

**Expected endpoint:** `wss://archety-backend-dev.up.railway.app/edge/ws`

**Question:** Is this endpoint implemented in the Railway backend? We're getting 404 Not Found.

**Possible issues:**
- Endpoint not implemented yet
- Different endpoint path (e.g., `/ws/edge` instead of `/edge/ws`)
- WebSocket server not running on dev environment
- Railway routing configuration missing WebSocket support

### 2. What authentication does the endpoint require?

**We're sending:**
```http
Authorization: Bearer b3c7ddc616a155d9190252454fd82d1be3c9840dc5a0937defb78d948af70d81
```

**Questions:**
- Does the endpoint expect `Authorization: Bearer {token}`?
- Is the token strictly the shared `EDGE_SECRET`?
- Is there a different auth mechanism for WebSocket?

### 3. Is the EDGE_SECRET configured on Railway?

**Expected environment variable on backend:**
```bash
EDGE_SECRET=b3c7ddc616a155d9190252454fd82d1be3c9840dc5a0937defb78d948af70d81
```

**Question:** Is this set in the Railway environment for the dev deployment?

### 4. What is the correct WebSocket URL format?

**Current attempt:**
```
wss://archety-backend-dev.up.railway.app/edge/ws?edge_agent_id=edge_13238407486
```

**Questions:**
- Is the path `/edge/ws` correct?
- Do we need query parameters or should agent_id be in headers only?
- Should we connect to a different subdomain?

---

## Response Codes We're Seeing

### 404 Not Found
- **When:** Testing with direct WebSocket connection
- **Meaning:** Endpoint doesn't exist or path is wrong

### 403 Forbidden
- **When:** Edge client attempting connection
- **Meaning:** Authentication rejection (but might be seeing this after 404)

### 1006 Abnormal Closure
- **When:** All connection attempts
- **Meaning:** Server immediately rejected/closed connection

---

## Backend Logs to Check

Please check Railway logs for:

1. **WebSocket connection attempts** around these timestamps:
   - `2025-11-15T06:38:44Z`
   - `2025-11-15T06:38:28Z`
   - `2025-11-15T06:38:20Z`

2. **Look for logs containing:**
   - `edge_13238407486` (our agent ID)
   - `/edge/ws` (endpoint path)
   - `Authorization` or `Bearer` (auth attempts)
   - WebSocket upgrade requests
   - 404 or 403 errors

3. **Expected log messages if working:**
   ```
   ✅ WebSocket connection established for edge_13238407486
   ✅ Edge agent registered with WebSocket manager
   ```

4. **Failure log messages to look for:**
   ```
   ❌ WebSocket connection rejected: missing auth header
   ❌ Token verification failed
   ❌ Invalid edge_agent_id
   ❌ Endpoint not found: /edge/ws
   ```

---

## What We Need from Backend Team

### Option 1: WebSocket Endpoint Exists

If the `/edge/ws` endpoint exists, please provide:

1. **Exact URL format:**
   ```
   wss://your-backend.com/correct/path?params=here
   ```

2. **Required headers:**
   ```http
   Authorization: Bearer {what-secret}
   X-Edge-Agent-Id: {required?}
   X-Other-Header: {if any}
   ```

3. **Environment variable name for authentication:**
   - Is it `EDGE_SECRET`?
   - Or something else?

4. **Is it configured on Railway dev environment?**

### Option 2: WebSocket Endpoint Doesn't Exist Yet

If WebSocket isn't implemented:

1. **Is it on the roadmap?**
2. **Should we disable WebSocket in the edge client?**
3. **Use HTTP polling only for now?**

---

## Temporary Workaround

The edge client gracefully falls back to HTTP polling when WebSocket fails:

```
[2025-11-15T06:38:44.700Z] [WARN] 🔌 WebSocket disconnected - falling back to HTTP polling
```

**Current behavior:**
- ✅ HTTP API (`/edge/message`) working with `EDGE_SECRET`
- ❌ WebSocket failing
- ✅ System continues to function via HTTP polling

**Impact:**
- Messages still get processed
- Slightly higher latency (polling vs real-time)
- More HTTP requests (polling overhead)

---

## Testing Commands for Backend Team

### Test if WebSocket endpoint exists

```bash
# Install websocat
brew install websocat

# Test connection
websocat \
  -H "Authorization: Bearer b3c7ddc616a155d9190252454fd82d1be3c9840dc5a0937defb78d948af70d81" \
  -H "X-Edge-Agent-Id: edge_13238407486" \
  "wss://archety-backend-dev.up.railway.app/edge/ws?edge_agent_id=edge_13238407486"
```

### Check Railway logs

```bash
# View live logs on Railway
railway logs --service archety-backend --environment development

# Filter for WebSocket
railway logs --service archety-backend --environment development | grep -i websocket
```

---

## Next Steps

1. **Backend team:** Please check if `/edge/ws` endpoint exists and is configured
2. **Backend team:** Provide correct WebSocket URL and authentication details
3. **Backend team:** Confirm `EDGE_SECRET` is set in Railway environment
4. **Edge client:** Will update configuration once we have correct details

---

## Contact

**Edge Client Engineer:** [Your Name]
**Backend Engineer:** Engineer 2
**Edge Agent ID:** `edge_13238407486`
**Phone:** `+13238407486`

---

**Document Status:** Ready for backend engineer review
**Created:** 2025-11-15
**Test Script:** `/Users/sage1/Code/edge-relay/test_websocket.js`
