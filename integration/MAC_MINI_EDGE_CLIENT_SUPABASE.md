# Mac Mini Edge Client: Supabase Integration Update

**Date:** November 13, 2025
**Status:** ⚠️ REQUIRED UPDATE - Edge client authentication changed
**Impact:** Orchestrator endpoint now requires webhook secret authentication

---

## Table of Contents

1. [Overview](#overview)
2. [What Changed](#what-changed)
3. [Update Instructions](#update-instructions)
4. [Code Changes](#code-changes)
5. [Testing](#testing)
6. [Rollback Plan](#rollback-plan)

---

## Overview

The backend has migrated to secure Supabase authentication. This affects how the Mac mini edge client authenticates with the orchestrator endpoint.

### What This Means for Edge Client

**Before:**
- Orchestrator endpoint had no authentication
- Any device could send messages to backend

**After:**
- Orchestrator endpoint requires webhook secret in Authorization header
- Only authenticated edge agents can send messages

---

## What Changed

### Orchestrator Endpoint Authentication

**Endpoint:** `POST /orchestrator/message`

**Before (insecure):**
```python
# ❌ No authentication
response = requests.post(
    "https://archety-backend-prod.up.railway.app/orchestrator/message",
    json={
        "chat_guid": "iMessage;-;+15551234567",
        "mode": "direct",
        "sender": "+15551234567",
        "text": "Hello Sage!",
        "timestamp": 1700000000,
        "participants": ["+15551234567"]
    }
)
```

**After (secure):**
```python
# ✅ Requires Authorization header with webhook secret
response = requests.post(
    "https://archety-backend-prod.up.railway.app/orchestrator/message",
    headers={
        "Authorization": f"Bearer {RELAY_WEBHOOK_SECRET}",
        "Content-Type": "application/json"
    },
    json={
        "chat_guid": "iMessage;-;+15551234567",
        "mode": "direct",
        "sender": "+15551234567",
        "text": "Hello Sage!",
        "timestamp": 1700000000,
        "participants": ["+15551234567"]
    }
)
```

---

## Update Instructions

### Step 1: Get Webhook Secret

The webhook secret is stored in Railway environment variables as `RELAY_WEBHOOK_SECRET`.

**✅ Current Production Secret (November 13, 2025):**
```bash
# Use this exact value for production and development
export RELAY_WEBHOOK_SECRET="b3c7ddc616a155d9190252454fd82d1be3c9840dc5a0937defb78d948af70d81"
```

⚠️ **Security Note:** This secret is already configured in Railway for both dev and production environments. If you need to rotate it, follow these steps:

**Option A: Retrieve from Railway**
```bash
# Backend engineer can retrieve it from Railway dashboard
# Or run this command:
railway run --service archety-backend bash -c 'echo $RELAY_WEBHOOK_SECRET'
```

**Option B: Generate new secret (for rotation)**
```bash
# Generate a secure random secret
openssl rand -hex 32

# Or in Python
python3 -c "import secrets; print(secrets.token_hex(32))"

# Then update Railway dev + prod environments
```

### Step 2: Store Secret on Mac Mini

Add the secret to your Mac mini edge client environment:

**Option A: Environment variable**
```bash
# Add to ~/.zshrc or ~/.bash_profile
export RELAY_WEBHOOK_SECRET="your_secret_here_64_chars_long"

# Reload shell
source ~/.zshrc
```

**Option B: Config file**
```python
# config.py
import os
from pathlib import Path

# Try to load from .env file
ENV_FILE = Path(__file__).parent / '.env'
if ENV_FILE.exists():
    from dotenv import load_dotenv
    load_dotenv(ENV_FILE)

RELAY_WEBHOOK_SECRET = os.getenv('RELAY_WEBHOOK_SECRET')

if not RELAY_WEBHOOK_SECRET:
    raise ValueError("RELAY_WEBHOOK_SECRET not set! Add to .env file or environment.")
```

**Option C: macOS Keychain (most secure)**
```bash
# Store in macOS Keychain
security add-generic-password \
  -a "archety-relay" \
  -s "relay-webhook-secret" \
  -w "your_secret_here"

# Retrieve in Python:
# import subprocess
# secret = subprocess.check_output([
#     'security', 'find-generic-password',
#     '-a', 'archety-relay',
#     '-s', 'relay-webhook-secret',
#     '-w'
# ]).decode().strip()
```

### Step 3: Update Edge Client Code

**Find the orchestrator message sending code:**

```python
# relay.py or similar file
import requests
import os

BACKEND_URL = "https://archety-backend-prod.up.railway.app"
RELAY_WEBHOOK_SECRET = os.getenv('RELAY_WEBHOOK_SECRET')

def send_to_orchestrator(message_data: dict) -> dict:
    """
    Send iMessage to backend orchestrator.

    Args:
        message_data: Message payload with chat_guid, sender, text, etc.

    Returns:
        Orchestrator response
    """
    # ✅ NEW: Add Authorization header
    headers = {
        "Authorization": f"Bearer {RELAY_WEBHOOK_SECRET}",
        "Content-Type": "application/json"
    }

    response = requests.post(
        f"{BACKEND_URL}/orchestrator/message",
        headers=headers,  # ✅ Include headers
        json=message_data,
        timeout=30
    )

    response.raise_for_status()
    return response.json()
```

**If using edge agent sync endpoint:**

```python
def sync_with_backend() -> dict:
    """
    Sync edge agent state with backend.

    POST /edge/sync
    """
    headers = {
        "Authorization": f"Bearer {RELAY_WEBHOOK_SECRET}",
        "Content-Type": "application/json"
    }

    response = requests.post(
        f"{BACKEND_URL}/edge/sync",
        headers=headers,
        json={
            "edge_agent_id": EDGE_AGENT_ID,
            "version": VERSION,
            "capabilities": ["schedule", "filter", "local_cache"],
            "events": [],  # Any events to report
        },
        timeout=30
    )

    response.raise_for_status()
    return response.json()
```

---

## Code Changes

### Complete Updated Relay Client

```python
#!/usr/bin/env python3
"""
Mac Mini Edge Client - iMessage Relay
Forwards iMessage conversations to Archety backend.

Updated: November 13, 2025
- Added webhook secret authentication
- Improved error handling for 401/403 errors
"""

import os
import sys
import json
import time
import logging
import requests
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime

# Configuration
BACKEND_URL = os.getenv('ARCHETY_BACKEND_URL', 'https://archety-backend-prod.up.railway.app')
RELAY_WEBHOOK_SECRET = os.getenv('RELAY_WEBHOOK_SECRET')
EDGE_AGENT_ID = os.getenv('EDGE_AGENT_ID', 'mac-mini-primary')

# Validate configuration
if not RELAY_WEBHOOK_SECRET:
    print("ERROR: RELAY_WEBHOOK_SECRET not set!")
    print("Set it with: export RELAY_WEBHOOK_SECRET='your-secret-here'")
    sys.exit(1)

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('archety-relay')


@dataclass
class Message:
    """iMessage data structure."""
    chat_guid: str
    mode: str  # 'direct' or 'group'
    sender: str  # Phone number in E.164 format
    text: str
    timestamp: int  # Unix timestamp
    participants: list[str]
    message_guid: Optional[str] = None
    attachments: Optional[list] = None


class ArchetyRelay:
    """
    Relay client for forwarding iMessages to Archety backend.
    """

    def __init__(self):
        self.backend_url = BACKEND_URL
        self.webhook_secret = RELAY_WEBHOOK_SECRET
        self.edge_agent_id = EDGE_AGENT_ID
        self.session = requests.Session()

        # Set default headers for all requests
        self.session.headers.update({
            'Authorization': f'Bearer {self.webhook_secret}',
            'Content-Type': 'application/json',
            'User-Agent': f'Archety-Edge-Client/{self.edge_agent_id}'
        })

        logger.info(f"Initialized Archety Relay")
        logger.info(f"Backend: {self.backend_url}")
        logger.info(f"Edge Agent ID: {self.edge_agent_id}")

    def send_message(self, message: Message) -> Dict[str, Any]:
        """
        Send message to orchestrator endpoint.

        Args:
            message: Message object to send

        Returns:
            Orchestrator response

        Raises:
            requests.HTTPError: If request fails
        """
        payload = {
            'chat_guid': message.chat_guid,
            'mode': message.mode,
            'sender': message.sender,
            'text': message.text,
            'timestamp': message.timestamp,
            'participants': message.participants,
        }

        if message.message_guid:
            payload['message_guid'] = message.message_guid

        if message.attachments:
            payload['attachments'] = message.attachments

        try:
            response = self.session.post(
                f'{self.backend_url}/orchestrator/message',
                json=payload,
                timeout=30
            )

            # Handle authentication errors
            if response.status_code == 401:
                logger.error("❌ Authentication failed - invalid webhook secret")
                logger.error("Check that RELAY_WEBHOOK_SECRET matches backend")
                raise requests.HTTPError("Invalid webhook secret")

            if response.status_code == 403:
                logger.error("❌ Forbidden - webhook secret valid but access denied")
                raise requests.HTTPError("Access denied")

            response.raise_for_status()

            result = response.json()
            logger.info(f"✅ Message sent successfully")
            logger.debug(f"Response: {result}")

            return result

        except requests.exceptions.Timeout:
            logger.error("❌ Request timed out after 30s")
            raise

        except requests.exceptions.ConnectionError as e:
            logger.error(f"❌ Connection error: {e}")
            logger.error("Check that backend is reachable")
            raise

        except requests.exceptions.HTTPError as e:
            logger.error(f"❌ HTTP error: {e}")
            logger.error(f"Response: {response.text if 'response' in locals() else 'No response'}")
            raise

    def sync_state(self, events: list = None) -> Dict[str, Any]:
        """
        Sync edge agent state with backend.

        Args:
            events: Optional list of events to report

        Returns:
            Sync response with any commands from backend
        """
        payload = {
            'edge_agent_id': self.edge_agent_id,
            'version': '1.0.0',
            'capabilities': ['schedule', 'filter', 'local_cache'],
            'events': events or [],
            'status': 'active',
            'last_sync': datetime.utcnow().isoformat()
        }

        try:
            response = self.session.post(
                f'{self.backend_url}/edge/sync',
                json=payload,
                timeout=10
            )

            response.raise_for_status()
            result = response.json()

            logger.info("✅ State synced with backend")
            logger.debug(f"Sync response: {result}")

            return result

        except Exception as e:
            logger.warning(f"⚠️  Sync failed: {e}")
            return {}

    def health_check(self) -> bool:
        """
        Check if backend is reachable and authentication is working.

        Returns:
            True if healthy, False otherwise
        """
        try:
            response = self.session.post(
                f'{self.backend_url}/orchestrator/heartbeat',
                json={'edge_agent_id': self.edge_agent_id},
                timeout=5
            )

            if response.status_code == 200:
                logger.info("✅ Backend health check passed")
                return True
            elif response.status_code == 401:
                logger.error("❌ Health check failed: Invalid webhook secret")
                return False
            else:
                logger.warning(f"⚠️  Health check returned {response.status_code}")
                return False

        except Exception as e:
            logger.error(f"❌ Health check failed: {e}")
            return False


# Example usage
def main():
    """Test the relay client."""
    relay = ArchetyRelay()

    # Health check
    if not relay.health_check():
        logger.error("Health check failed - exiting")
        sys.exit(1)

    # Test message
    test_message = Message(
        chat_guid="iMessage;-;+15551234567",
        mode="direct",
        sender="+15551234567",
        text="Hello from Mac mini relay!",
        timestamp=int(time.time()),
        participants=["+15551234567"]
    )

    try:
        result = relay.send_message(test_message)
        logger.info(f"Test message sent successfully: {result}")

    except Exception as e:
        logger.error(f"Test message failed: {e}")
        sys.exit(1)


if __name__ == '__main__':
    main()
```

---

## Testing

### Step 1: Test Authentication

```bash
# Test with correct secret
python3 test_relay.py

# Expected output:
# ✅ Backend health check passed
# ✅ Message sent successfully
```

### Step 2: Test with Invalid Secret (to verify security)

```bash
# Temporarily use wrong secret
export RELAY_WEBHOOK_SECRET="wrong-secret"
python3 test_relay.py

# Expected output:
# ❌ Authentication failed - invalid webhook secret
```

### Step 3: Integration Test

```bash
# Send real iMessage and verify it reaches backend
# Check backend logs for:
# "✅ Orchestrator message received from edge agent"
```

---

## Troubleshooting

### Issue: "401 Unauthorized" error

**Cause:** Webhook secret doesn't match backend

**Solution:**
1. Check that `RELAY_WEBHOOK_SECRET` is set correctly:
   ```bash
   echo $RELAY_WEBHOOK_SECRET
   ```

2. Verify it matches the backend secret in Railway:
   ```bash
   # Ask backend engineer for the secret
   # Or check Railway dashboard → archety-backend → Variables
   ```

3. Make sure the Authorization header is formatted correctly:
   ```python
   headers = {
       "Authorization": f"Bearer {RELAY_WEBHOOK_SECRET}",
       # NOT: "Authorization": RELAY_WEBHOOK_SECRET
   }
   ```

### Issue: "Connection refused" error

**Cause:** Backend URL is incorrect or backend is down

**Solution:**
1. Check backend URL is correct:
   ```bash
   curl https://archety-backend-prod.up.railway.app/health
   ```

2. Verify DNS resolution:
   ```bash
   nslookup archety-backend-prod.up.railway.app
   ```

3. Check backend logs in Railway dashboard

### Issue: Messages not reaching backend

**Cause:** Could be network, authentication, or backend issue

**Solution:**
1. Check edge client logs for errors
2. Test health check endpoint:
   ```python
   relay.health_check()
   ```
3. Check backend logs in Railway
4. Verify message format is correct

---

## Rollback Plan

If you need to temporarily rollback to old auth (not recommended):

### Backend Rollback
Backend engineer needs to temporarily disable auth on orchestrator endpoint:

```python
# app/api/orchestrator_routes.py
# Temporarily comment out auth dependency
@router.post("/message")
async def handle_orchestrator_message(
    request: OrchestratorRequest,
    # current_user: User = Depends(get_current_relay)  # Commented out
):
    # ... rest of code
```

### Edge Client Rollback
Remove Authorization header:

```python
response = requests.post(
    f"{BACKEND_URL}/orchestrator/message",
    # headers=headers,  # Comment out
    json=message_data
)
```

**Note:** This rollback is insecure and should only be temporary!

---

## Production Checklist

Before deploying to production edge client:

- [ ] RELAY_WEBHOOK_SECRET is set and matches backend
- [ ] Edge client code updated with Authorization header
- [ ] Health check passes
- [ ] Test message sends successfully
- [ ] Logs show no authentication errors
- [ ] Backend logs show authenticated requests
- [ ] Integration test with real iMessage passes

---

## Environment Setup

### Production Mac Mini

```bash
# Add to ~/.zshrc or create a startup script
export ARCHETY_BACKEND_URL="https://archety-backend-prod.up.railway.app"
export RELAY_WEBHOOK_SECRET="your-production-secret-here"
export EDGE_AGENT_ID="mac-mini-primary"
```

### Development Mac Mini

```bash
export ARCHETY_BACKEND_URL="https://archety-backend-dev.up.railway.app"
export RELAY_WEBHOOK_SECRET="your-dev-secret-here"
export EDGE_AGENT_ID="mac-mini-dev"
```

---

## Support

For issues or questions:
- Backend engineer: Check `/docs/implementation/SUPABASE_RLS_AND_STORAGE.md`
- Edge agent docs: Check `/docs/edge/`
- Slack: #engineering-support

---

**Last Updated:** November 13, 2025
**Backend Version:** v3.6+ (Supabase Auth)
**Required Edge Client Version:** v2.0+ (Webhook auth)
