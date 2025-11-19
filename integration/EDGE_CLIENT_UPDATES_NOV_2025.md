# Edge Client Backend Updates - November 2025

**For:** Engineer 1 (Edge Client Implementation)
**From:** Backend Engineering Team
**Date:** November 14, 2025
**Priority:** 🔴 CRITICAL - Breaking Changes Included

---

## 🚨 Critical Breaking Changes

### 1. Authentication Now Required (CRITICAL)

**What Changed:**
The `/orchestrator/message` endpoint now requires Bearer token authentication via the `Authorization` header.

**Old Behavior:**
```typescript
// ❌ OLD - No authentication
await axios.post(`${backendUrl}/orchestrator/message`, payload);
```

**New Behavior:**
```typescript
// ✅ NEW - Bearer token required
await axios.post(
  `${backendUrl}/orchestrator/message`,
  payload,
  {
    headers: {
      'Authorization': `Bearer ${EDGE_SECRET}`,
      'Content-Type': 'application/json'
    }
  }
);
```

**Configuration Required:**
```bash
# Add to your .env file
EDGE_SECRET="your-shared-secret-here"
```

**⚠️ Important Notes:**
- The backend will accept requests without auth if `EDGE_SECRET` is not configured, but this is ONLY for development
- Production deployments MUST set this secret
- The secret must match between edge client and backend
- You'll get `401 Unauthorized` if the secret is missing or incorrect

**Backend Code Reference:** `app/main.py:319-371`

---

## 2. Photo Processing Support (NEW)

**What's Available:**
The backend now supports photo message processing with automatic analysis and memory extraction.

**How to Send Photos:**

1. **Upload Photo to Backend:**
```typescript
const formData = new FormData();
formData.append('file', photoFile);

const uploadResponse = await axios.post(
  `${backendUrl}/photos/upload`,
  formData,
  {
    headers: {
      'Content-Type': 'multipart/form-data',
      'Authorization': `Bearer ${EDGE_SECRET}`
    },
    params: {
      user_phone: userPhone,
      chat_guid: chatGuid
    }
  }
);

const photoId = uploadResponse.data.photo_id;
```

2. **Send Photo Message to Orchestrator:**
```typescript
await axios.post(
  `${backendUrl}/orchestrator/message`,
  {
    chat_guid: chatGuid,
    mode: "direct",
    sender: userPhone,
    text: userCaption || "Photo",
    timestamp: Date.now(),
    participants: [userPhone],
    metadata: {
      has_attachment: true,
      attachment_type: "photo",
      photo_id: photoId
    }
  },
  {
    headers: {
      'Authorization': `Bearer ${EDGE_SECRET}`
    }
  }
);
```

**What the Backend Does:**
1. Analyzes photo using GPT-4o Vision API
2. Extracts memories (activities, people, places, preferences)
3. Stores memories with `visual_*` types
4. Returns acknowledgment with photo summary

**Example Response:**
```json
{
  "should_respond": true,
  "reply_text": "love the energy in this photo! that guitar looks well-loved 🎸",
  "schedule_message": null
}
```

**Backend Code Reference:** `app/api/photo_routes.py`, `app/memory/photo_analyzer.py`

---

## 3. Rate Limiting (NEW)

**What Changed:**
The `/orchestrator/message` endpoint now has rate limiting applied.

**Limits:**
- **Per User:** 60 messages per minute (per sender phone number)
- **Fallback:** IP-based limiting if user cannot be identified

**Error Response:**
```json
{
  "error": "Too Many Requests",
  "detail": "60 per 1 minute"
}
```

**HTTP Status:** `429 Too Many Requests`

**Retry-After Header:** Indicates when to retry (in seconds)

**How to Handle:**
```typescript
try {
  await axios.post(url, payload);
} catch (error) {
  if (error.response?.status === 429) {
    const retryAfter = error.response.headers['retry-after'];
    console.log(`Rate limited. Retry after ${retryAfter} seconds`);
    // Queue message for retry or show user feedback
  }
}
```

**Backend Code Reference:** `app/main.py:320-321`

---

## 4. Platform Prefix (Internal Change - No Action Required)

**What Changed:**
The backend now internally prefixes all chat GUIDs with `imessage:` for platform-agnostic conversation tracking.

**Edge Client Action:**
- **No change required** - Continue sending plain chat GUIDs
- Backend automatically adds the `imessage:` prefix

**Example:**
```typescript
// Edge client sends:
{
  "chat_guid": "iMessage;-;+15551234567"
}

// Backend internally transforms to:
{
  "chat_guid": "imessage:iMessage;-;+15551234567"
}
```

**Backend Code Reference:** `app/main.py:391-394`

---

## 5. Room & Multiplayer Context (Internal Enhancement)

**What Changed:**
The backend now tracks "rooms" for multiplayer support (multiple users interacting with same AI instance).

**Edge Client Impact:**
- Minimal - metadata is automatically enhanced
- `room_id` and `assistant_instance_id` may appear in response metadata

**Example Response Metadata:**
```json
{
  "should_respond": true,
  "reply_text": "...",
  "metadata": {
    "room_id": "uuid-here",
    "assistant_instance_id": "uuid-here",
    "room_type": "direct",
    "participants_count": 1
  }
}
```

**Backend Code Reference:** `app/orchestrator/room_handler.py`

---

## 6. Redis Response Caching (Backend Optimization)

**What Changed:**
Backend now caches similar responses to reduce LLM costs and improve latency.

**Edge Client Impact:**
- **None** - Completely transparent
- Responses may be faster for repeated queries
- No changes required to edge client code

**Backend Code Reference:** `app/cache/response_cache.py`

---

## 7. Supabase Migration (Database Architecture Change)

**What Changed:**
Backend migrated from direct PostgreSQL to Supabase client.

**Edge Client Impact:**
- **None** - Database changes are internal only
- No API changes

---

## 8. HMAC Signature Validation (Future - Not Yet Active)

**Status:** Infrastructure ready but not enforced

**What's Coming:**
The backend has HMAC signature validation ready for production hardening. When activated, the edge client will need to sign requests.

**Future Implementation:**
```typescript
import crypto from 'crypto';

function generateHMACSignature(body: string, secret: string): { signature: string, timestamp: number } {
  const timestamp = Math.floor(Date.now() / 1000);
  const message = `${timestamp}${body}`;
  const signature = crypto
    .createHmac('sha256', secret)
    .update(message)
    .digest('hex');

  return { signature, timestamp };
}

// When HMAC is enabled:
const body = JSON.stringify(payload);
const { signature, timestamp } = generateHMACSignature(body, EDGE_SECRET);

await axios.post(url, payload, {
  headers: {
    'Authorization': `Bearer ${EDGE_SECRET}`,
    'X-Signature': signature,
    'X-Timestamp': timestamp.toString()
  }
});
```

**Backend Code Reference:** `app/security/hmac_auth.py`

**Note:** You will be notified before this is activated in production.

---

## Migration Checklist for Edge Client

### Immediate (Required for Production)

- [ ] **Add Bearer token authentication**
  - [ ] Add `EDGE_SECRET` to environment variables
  - [ ] Update `/orchestrator/message` requests to include `Authorization: Bearer {secret}`
  - [ ] Test authentication with dev backend
  - [ ] Verify 401 error handling

- [ ] **Handle rate limiting**
  - [ ] Add 429 error handling
  - [ ] Implement retry logic with `Retry-After` header
  - [ ] Queue messages if rate limit exceeded

- [ ] **Test error scenarios**
  - [ ] Missing Authorization header → 401
  - [ ] Invalid secret → 401
  - [ ] Rate limit exceeded → 429
  - [ ] Verify error messages are user-friendly

### Optional (Photo Support)

- [ ] **Implement photo upload flow**
  - [ ] Detect photo attachments in iMessage
  - [ ] Upload photos to `/photos/upload`
  - [ ] Send orchestrator message with `photo_id` in metadata
  - [ ] Handle photo analysis responses

### Future (When HMAC is Activated)

- [ ] **Implement HMAC signature generation**
  - [ ] Add `X-Signature` header
  - [ ] Add `X-Timestamp` header
  - [ ] Test signature validation
  - [ ] Handle signature errors

---

## Updated API Documentation

### POST /orchestrator/message

**Headers:**
```
Content-Type: application/json
Authorization: Bearer {EDGE_SECRET}  # ⚠️ NEW - Required
X-Signature: {hmac-sha256}                    # Future
X-Timestamp: {unix-timestamp}                 # Future
```

**Request Body:**
```json
{
  "chat_guid": "iMessage;-;+15551234567",
  "mode": "direct",
  "sender": "+15551234567",
  "text": "I'm so stressed about this week",
  "timestamp": 1699123456,
  "participants": ["+15551234567"],
  "metadata": {
    "is_first_message": false,
    "mentioned_sage": false,
    "has_attachment": false,        // NEW - for photo support
    "attachment_type": "photo",     // NEW
    "photo_id": "uuid-here"         // NEW
  }
}
```

**Response (200 OK):**
```json
{
  "should_respond": true,
  "reply_text": "ugh I felt that energy. wanna tell me what's stressing you out?",
  "schedule_message": null,
  "metadata": {                     // NEW - room context
    "room_id": "uuid",
    "assistant_instance_id": "uuid"
  }
}
```

**Error Responses:**

**401 Unauthorized:**
```json
{
  "detail": "Unauthorized - missing relay authentication"
}
```

**429 Too Many Requests:**
```json
{
  "error": "Too Many Requests",
  "detail": "60 per 1 minute"
}
```

---

## Environment Variables

**Required:**
```bash
# Backend URL
BACKEND_URL=https://archety-backend-prod.up.railway.app

# Authentication (REQUIRED for production)
EDGE_SECRET=your-shared-secret-here

# User identification
USER_PHONE=+15551234567
```

**Generating the Secret:**
```bash
# Generate a secure random secret (32 characters)
openssl rand -hex 32
```

**Setting on Railway (Backend):**
```bash
# The backend engineer will set this
EDGE_SECRET=your-shared-secret-here
```

**Setting in Edge Client:**
```bash
# Copy the same secret to your edge client
export EDGE_SECRET=your-shared-secret-here
```

---

## Testing Instructions

### 1. Test Authentication

**Valid Token:**
```bash
curl -X POST https://archety-backend-dev.up.railway.app/orchestrator/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret" \
  -d '{
    "chat_guid": "test",
    "mode": "direct",
    "sender": "+15551234567",
    "text": "test",
    "timestamp": 1699123456,
    "participants": ["+15551234567"]
  }'
```

**Expected:** 200 OK with response

**Invalid Token:**
```bash
curl -X POST https://archety-backend-dev.up.railway.app/orchestrator/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong-secret" \
  -d '{ ... }'
```

**Expected:** 401 Unauthorized

**Missing Token:**
```bash
curl -X POST https://archety-backend-dev.up.railway.app/orchestrator/message \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

**Expected:** 401 Unauthorized (in production)

### 2. Test Rate Limiting

```bash
# Send 61 requests rapidly
for i in {1..61}; do
  curl -X POST https://archety-backend-dev.up.railway.app/orchestrator/message \
    -H "Authorization: Bearer your-secret" \
    -H "Content-Type: application/json" \
    -d '{
      "chat_guid": "test",
      "mode": "direct",
      "sender": "+15551234567",
      "text": "message '$i'",
      "timestamp": '$(date +%s)',
      "participants": ["+15551234567"]
    }'
done
```

**Expected:** First 60 succeed, 61st returns 429

---

## Example: Updated Edge Client Code

**src/sync/client.ts:**
```typescript
import axios from 'axios';

export class OrchestratorClient {
  constructor(
    private backendUrl: string,
    private edgeSecret: string
  ) {}

  async sendMessage(payload: {
    chat_guid: string;
    mode: string;
    sender: string;
    text: string;
    timestamp: number;
    participants: string[];
    metadata?: any;
  }): Promise<any> {
    try {
      const response = await axios.post(
        `${this.backendUrl}/orchestrator/message`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${this.edgeSecret}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000  // 10 second timeout
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          console.error('❌ Authentication failed - check EDGE_SECRET');
          throw new Error('Authentication failed');
        } else if (error.response?.status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 60;
          console.warn(`⚠️ Rate limited - retry after ${retryAfter}s`);
          throw new Error(`Rate limited - retry after ${retryAfter}s`);
        }
      }
      throw error;
    }
  }
}
```

**Usage:**
```typescript
const client = new OrchestratorClient(
  process.env.BACKEND_URL!,
  process.env.EDGE_SECRET!
);

const response = await client.sendMessage({
  chat_guid: threadId,
  mode: 'direct',
  sender: userPhone,
  text: message,
  timestamp: Date.now(),
  participants: [userPhone]
});

if (response.should_respond) {
  await sendIMessage(threadId, response.reply_text);
}
```

---

## Backend Environment (For Reference)

**Production:**
- URL: `https://archety-backend-prod.up.railway.app`
- Environment: `production`
- EDGE_SECRET: ✅ Configured

**Development:**
- URL: `https://archety-backend-dev.up.railway.app`
- Environment: `development`
- EDGE_SECRET: ⚠️ May be disabled for easier testing

---

## Support & Questions

**Backend Engineer:** Engineer 2
**Backend Repository:** https://github.com/rawrjustin/archety
**API Documentation:** https://archety-backend-prod.up.railway.app/docs
**Edge Spec:** `/docs/edge/EDGE_AGENT_SPEC.md`
**Implementation Guide:** `/docs/edge/MAC_MINI_IMPLEMENTATION.md`

**Questions?**
- Check the backend API docs at `/docs` endpoint
- Review error logs in Railway dashboard
- Test changes in dev environment first

---

## Timeline

**November 14, 2025:**
- ✅ Bearer token authentication implemented
- ✅ Rate limiting active
- ✅ Photo processing support available
- ✅ Redis caching deployed
- ✅ Documentation updated

**Next 2 Weeks:**
- ⏳ HMAC signature validation (optional, will notify before activation)
- ⏳ Edge agent fleet management improvements

**1 Month:**
- ⏳ Multi-device sync
- ⏳ Voice message transcription

---

## Summary: What You Need to Do

1. **Add Bearer token authentication** (CRITICAL)
   - Add `Authorization: Bearer {secret}` to all `/orchestrator/message` requests
   - Configure `EDGE_SECRET` environment variable

2. **Handle rate limiting** (IMPORTANT)
   - Add 429 error handling
   - Implement retry logic

3. **Test thoroughly** (REQUIRED)
   - Test with valid/invalid tokens
   - Test rate limiting
   - Verify error messages

4. **Optional: Add photo support**
   - Upload photos to `/photos/upload`
   - Include photo metadata in orchestrator requests

---

**Document Version:** 1.0
**Last Updated:** November 14, 2025
**Status:** Active - Implementation Required
