# Edge Client Quick Start - Critical Changes

**⚠️ BREAKING CHANGES - Action Required**
**Date:** November 14, 2025

---

## 🚨 CRITICAL: Authentication Now Required

**Add this to your edge client NOW:**

```typescript
// ❌ OLD CODE (Will fail in production)
await axios.post(`${backendUrl}/orchestrator/message`, payload);

// ✅ NEW CODE (Required)
await axios.post(
  `${backendUrl}/orchestrator/message`,
  payload,
  {
    headers: {
      'Authorization': `Bearer ${process.env.EDGE_SECRET}`,
      'Content-Type': 'application/json'
    }
  }
);
```

**Environment Variable:**
```bash
# Add to .env
EDGE_SECRET="your-shared-secret-here"

# Generate secret (32 characters):
openssl rand -hex 32
```

**⚠️ You will get `401 Unauthorized` without this!**

---

## 📋 3-Minute Implementation Checklist

### Step 1: Add Secret to Environment
```bash
# Generate a secret
SECRET=$(openssl rand -hex 32)
echo "EDGE_SECRET=$SECRET" >> .env

# Send this secret to backend engineer to configure on Railway
echo "Backend engineer: Add this to Railway environment variables:"
echo "EDGE_SECRET=$SECRET"
```

### Step 2: Update Your HTTP Client
```typescript
// Create a reusable client
import axios from 'axios';

const orchestratorClient = axios.create({
  baseURL: process.env.BACKEND_URL,
  headers: {
    'Authorization': `Bearer ${process.env.EDGE_SECRET}`,
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Use it
const response = await orchestratorClient.post('/orchestrator/message', payload);
```

### Step 3: Add Error Handling
```typescript
try {
  const response = await orchestratorClient.post('/orchestrator/message', payload);
  // Process response
} catch (error) {
  if (error.response?.status === 401) {
    console.error('❌ Auth failed - check EDGE_SECRET');
  } else if (error.response?.status === 429) {
    const retryAfter = error.response.headers['retry-after'] || 60;
    console.warn(`⚠️ Rate limited - retry after ${retryAfter}s`);
  }
  throw error;
}
```

### Step 4: Test It
```bash
# Test with curl
curl -X POST https://archety-backend-dev.up.railway.app/orchestrator/message \
  -H "Authorization: Bearer $EDGE_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "chat_guid": "test",
    "mode": "direct",
    "sender": "+15551234567",
    "text": "test message",
    "timestamp": '$(date +%s)',
    "participants": ["+15551234567"]
  }'
```

**Expected:**
- ✅ `200 OK` with response → Authentication working!
- ❌ `401 Unauthorized` → Secret doesn't match backend

---

## 📖 Full Documentation

For complete details including:
- Photo processing support
- Rate limiting handling
- HMAC signature validation (future)
- Example code
- Testing instructions

See: [`EDGE_CLIENT_UPDATES_NOV_2025.md`](./EDGE_CLIENT_UPDATES_NOV_2025.md)

---

## 📞 Need Help?

- Backend Engineer: Engineer 2
- Backend Docs: https://archety-backend-prod.up.railway.app/docs
- Edge Spec: `/docs/edge/EDGE_AGENT_SPEC.md`

---

**Status:** 🔴 CRITICAL - Implement immediately for production
**Estimated Time:** 5-10 minutes
