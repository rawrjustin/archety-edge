# Edge Agent Credentials

**Generated:** November 4, 2025
**For:** Engineer 1 (Mac Mini Edge Agent)
**Status:** Active

---

## 🔐 Authentication Credentials

### EDGE_SECRET (Backend)
This secret is used by the backend to sign and verify edge agent tokens.

**Already added to backend `.env` file**

```
EDGE_SECRET=74a0e606d739d31eda5dafb6f7e0f345d4756df0fe908282715174fd8978e261
```

### REGISTRATION_TOKEN (Edge Agent)
This is a one-time token used for initial edge agent registration.

**Use this during first-time setup:**

```
REGISTRATION_TOKEN=edge_48AC5XRZ8ccUuqsNdk4mqBziDenh7Ueta4bIqv1oIF0
```

---

## 📋 How to Use These Credentials

### For Engineer 2 (Backend) - ALREADY DONE ✅
The `EDGE_SECRET` has been added to the backend `.env` file. No action needed.

### For Engineer 1 (Edge Agent)

#### Step 1: Initial Registration

When you run the edge agent for the first time, use the registration token:

```bash
# In your edge agent .env or config
REGISTRATION_TOKEN=edge_48AC5XRZ8ccUuqsNdk4mqBziDenh7Ueta4bIqv1oIF0
BACKEND_URL=https://archety-backend.onrender.com
```

#### Step 2: Register Edge Agent

Make a registration request to the backend:

```bash
curl -X POST https://archety-backend.onrender.com/edge/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer edge_48AC5XRZ8ccUuqsNdk4mqBziDenh7Ueta4bIqv1oIF0" \
  -d '{
    "edge_agent_id": "mac-mini-1",
    "user_phone": "+15551234567",
    "version": "1.0.0",
    "capabilities": ["schedule", "filter", "monitor"]
  }'
```

#### Step 3: Save Permanent Token

The backend will respond with a permanent authentication token:

```json
{
  "edge_agent_id": "mac-mini-1",
  "auth_token": "ZWRnZV9hZ2VudF9pZDp1c2VyX3Bob25lOnRpbWVzdGFtcDpzaWduYXR1cmU=",
  "expires_at": "2025-11-05T12:00:00Z"
}
```

**Save this `auth_token` permanently** - use it for all future API calls.

#### Step 4: Use Permanent Token

For all subsequent requests, use the permanent token:

```bash
curl -X POST https://archety-backend.onrender.com/edge/sync \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ZWRnZV9hZ2VudF9pZDp1c2VyX3Bob25lOnRpbWVzdGFtcDpzaWduYXR1cmU=" \
  -H "X-Edge-Protocol-Version: 1.0" \
  -H "X-Edge-Timestamp: $(date +%s)" \
  -d '{
    "edge_agent_id": "mac-mini-1",
    "events": [],
    "status": {
      "health": "healthy",
      "uptime": 3600
    }
  }'
```

---

## 🔄 Token Lifecycle

### Registration Token (One-Time)
- **Purpose:** Initial setup only
- **Expiry:** Single use (consumed on first registration)
- **Storage:** Don't store permanently - only needed for first registration

### Permanent Auth Token
- **Purpose:** All ongoing communication
- **Expiry:** 24 hours (auto-refresh via sync)
- **Storage:** Store securely on Mac mini (keychain recommended)
- **Refresh:** Automatically refreshed during `/edge/sync` calls

---

## 🔒 Security Best Practices

### For the Registration Token
1. ✅ Use only during initial setup
2. ✅ Delete from config after successful registration
3. ✅ Never commit to git
4. ✅ Never share publicly

### For the Permanent Token
1. ✅ Store in macOS Keychain or secure storage
2. ✅ Rotate if compromised
3. ✅ Monitor for unauthorized access
4. ✅ Never log the full token

### For the EDGE_SECRET
1. ✅ Never expose to clients
2. ✅ Backend only - never send to edge agent
3. ✅ Rotate periodically (requires re-registering all agents)
4. ✅ Different secret per environment (dev/staging/prod)

---

## 🚨 If Credentials Are Compromised

### If Registration Token is Leaked
- Generate new registration token
- Update this document
- Notify Engineer 1

### If Permanent Token is Compromised
- Re-register edge agent with registration token
- Revoke old token via backend API
- Update stored credentials

### If EDGE_SECRET is Compromised
- **CRITICAL:** Regenerate EDGE_SECRET
- All edge agents must re-register
- Update backend .env immediately
- Audit access logs

---

## 📞 Questions?

- **Protocol Spec:** [EDGE_AGENT_SPEC.md](./EDGE_AGENT_SPEC.md)
- **Implementation Guide:** [MAC_MINI_IMPLEMENTATION.md](./MAC_MINI_IMPLEMENTATION.md)
- **Backend Deployment:** [../backend/DEPLOYMENT.md](../backend/DEPLOYMENT.md)

---

## 🔐 Credential Summary

| Credential | Type | Location | Purpose |
|------------|------|----------|---------|
| `EDGE_SECRET` | Signing Key | Backend .env | Sign/verify tokens |
| `REGISTRATION_TOKEN` | One-time | Edge agent config | Initial registration |
| Permanent Token | Auth Token | Edge agent storage | Ongoing communication |

**Status:** All credentials generated and ready for use ✅
