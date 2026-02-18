# Multi-Persona Edge Agent Setup Guide

**Goal:** Run 4-6 AI companion personas (Sage, Vex, Echo, Kael, + future characters) on a single Mac mini M4 16GB, each with its own phone number and iMessage account.

**Status:** Validation guide — follow these steps to confirm feasibility before provisioning production personas.

---

## Prerequisites

- Mac mini M4 16GB (or M2 16GB) running macOS Sequoia 15+
- Admin account with sudo access
- 4-6 iMessage-capable phone numbers (one per persona)
- Each phone number activated with an Apple ID signed into iMessage
- The `archety-edge` repo cloned and buildable (`npm run build` succeeds)

---

## Architecture: Why Separate macOS Accounts?

Apple restricts iMessage to **one phone number per macOS user account**. Each persona needs its own:

- macOS user account (signed into its own Apple ID)
- Running user session (Messages.app must be accessible)
- Edge agent process with its own `config.yaml`
- LaunchDaemon plist for auto-start
- Dedicated ports (health check + admin portal)

```
Mac mini M4 16GB
├── sage1 (macOS user) ─── Edge Agent (port 3001/3100) ─── +1xxxSAGE
├── vex1  (macOS user) ─── Edge Agent (port 3002/3101) ─── +1xxxVEX
├── echo1 (macOS user) ─── Edge Agent (port 3003/3102) ─── +1xxxECHO
├── kael1 (macOS user) ─── Edge Agent (port 3004/3103) ─── +1xxxKAEL
├── char5 (macOS user) ─── Edge Agent (port 3005/3104) ─── +1xxxCHAR5
└── char6 (macOS user) ─── Edge Agent (port 3006/3105) ─── +1xxxCHAR6
```

---

## Phase 1: Create macOS User Accounts

Start with 2 test accounts (beyond your existing `sage1`), then scale up.

### 1.1 Create accounts

```bash
# Create test persona accounts (run as admin)
sudo sysadminctl -addUser vex1 -fullName "Vex Agent" -password "<secure-password>" -admin
sudo sysadminctl -addUser echo1 -fullName "Echo Agent" -password "<secure-password>" -admin

# Verify accounts exist
dscl . -list /Users | grep -E "sage1|vex1|echo1"
```

### 1.2 Configure auto-login prevention workaround

Only one macOS account can be set as the auto-login user. For multi-user, disable auto-login and use Fast User Switching instead:

```bash
# Disable auto-login (forces login screen on boot)
sudo defaults delete /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null || true
```

### 1.3 Enable Fast User Switching

```bash
# Enable Fast User Switching in menu bar
sudo defaults write /Library/Preferences/.GlobalPreferences MultipleSessionEnabled -bool true
```

Also enable via: **System Settings → Control Center → Fast User Switching → Show in Menu Bar**

---

## Phase 2: Establish User Sessions

Each persona's Messages.app must be accessible, which requires an active login session. **This is the critical constraint to validate.**

### 2.1 Log into each account via GUI

1. Click the Fast User Switching menu (top-right menu bar)
2. Select the new user account
3. Complete initial macOS setup wizard
4. Open **Messages.app** and sign in with that persona's Apple ID
5. Send a test message from another device to confirm iMessage is working
6. Switch back to your admin account (do NOT log out — just switch)

Repeat for each persona account.

### 2.2 Verify all sessions are active

After logging into all accounts and switching back to admin:

```bash
# List all logged-in users — each persona should appear
who

# Verify each user has a loginwindow process (= active session)
ps aux | grep loginwindow

# Count active sessions
who | wc -l
```

**Expected output:** Each persona account should show a `console` session.

### 2.3 Verify Messages.app is accessible per-user

```bash
# Test AppleScript access for each user
# NOTE: This may require TCC/Automation permission grants on first run
sudo -u vex1 osascript -e 'tell application "Messages" to get name'
sudo -u echo1 osascript -e 'tell application "Messages" to get name'

# Expected output: "Messages"
# If you get an error about WindowServer, the user session isn't active
```

### 2.4 Verify chat.db exists and is readable

```bash
# Check that Messages has created the database for each user
sudo ls -la /Users/vex1/Library/Messages/chat.db
sudo ls -la /Users/echo1/Library/Messages/chat.db

# Test that the database has content
sudo -u vex1 sqlite3 /Users/vex1/Library/Messages/chat.db "SELECT COUNT(*) FROM message;" 2>/dev/null
sudo -u echo1 sqlite3 /Users/echo1/Library/Messages/chat.db "SELECT COUNT(*) FROM message;" 2>/dev/null
```

---

## Phase 3: Deploy Edge Agent Per Persona

### 3.1 Clone the repo into each user's home directory

```bash
# Clone archety-edge for each persona user
sudo -u vex1 git clone <repo-url> /Users/vex1/Code/archety-edge
sudo -u echo1 git clone <repo-url> /Users/echo1/Code/archety-edge

# Install dependencies for each
sudo -u vex1 bash -c "cd /Users/vex1/Code/archety-edge && npm install && npm run build"
sudo -u echo1 bash -c "cd /Users/echo1/Code/archety-edge && npm install && npm run build"
```

### 3.2 Create per-persona config.yaml

Each persona gets its own config with unique `agent_id`, `persona_id`, `user_phone`, paths, and ports.

**Example: `/Users/vex1/Code/archety-edge/config.yaml`**

```yaml
edge:
  agent_id: "vex1"
  user_phone: "+1XXXXXXXXXX"    # Vex's iMessage phone number
  persona_id: "vex"

backend:
  url: "https://archety-backend-prod.up.railway.app"
  websocket_url: "wss://archety-backend-prod.up.railway.app"
  sync_interval_seconds: 30

websocket:
  enabled: true
  reconnect_attempts: 10
  ping_interval_seconds: 30

imessage:
  poll_interval_seconds: 2       # Use 2s for non-primary personas
  db_path: "/Users/vex1/Library/Messages/chat.db"
  attachments_path: "/Users/vex1/Library/Messages/Attachments"
  transport_mode: "native_helper"
  bridge_executable: "./native/messages-helper/.build/release/messages-helper"
  bridge_args: []

database:
  path: "./edge-agent.db"
  state_path: "./data/edge-state.db"

scheduler:
  adaptive_mode: true
  check_interval_seconds: 30

logging:
  level: "info"                  # Use info (not debug) to reduce disk I/O
  file: "./edge-agent.log"

monitoring:
  sentry:
    enabled: false
  amplitude:
    enabled: true
    api_key: "${AMPLITUDE_API_KEY}"
    flush_interval_ms: 10000
  health_check:
    enabled: true
    port: 3002                   # UNIQUE per persona: sage=3001, vex=3002, echo=3003, etc.

security:
  keychain_service: "com.archety.edge.vex"   # UNIQUE per persona
  keychain_account: "edge-state"
```

### 3.3 Create per-persona .env file

**Example: `/Users/vex1/Code/archety-edge/.env`**

```bash
EDGE_SECRET=<shared-edge-secret>
BACKEND_URL=https://archety-backend-prod.up.railway.app
USER_PHONE=+1XXXXXXXXXX
AMPLITUDE_API_KEY=<amplitude-key>
```

### 3.4 Build the native Swift helper per-user

```bash
sudo -u vex1 bash -c "cd /Users/vex1/Code/archety-edge/native/messages-helper && swift build -c release"
```

### 3.5 Grant macOS permissions per-user

For each persona user account, log into that account via Fast User Switching and grant:

1. **Full Disk Access** for the `node` binary:
   - System Settings → Privacy & Security → Full Disk Access
   - Add `/usr/local/bin/node` (or the path from `which node`)

2. **Automation permission** for Messages.app:
   - This triggers automatically on first AppleScript execution
   - Run `osascript -e 'tell application "Messages" to get name'` to trigger the prompt
   - Click "Allow"

3. **Accessibility** (if needed for AppleScript sending):
   - System Settings → Privacy & Security → Accessibility
   - Add Terminal or the node binary

---

## Phase 4: Install LaunchDaemons

Create a LaunchDaemon plist for each persona so they auto-start on boot.

### 4.1 Create per-persona plist

**Example: `/Library/LaunchDaemons/com.archety.edge-vex.plist`**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.archety.edge-vex</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/vex1/Code/archety-edge/dist/admin-portal/server/index.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/vex1/Code/archety-edge</string>

    <key>UserName</key>
    <string>vex1</string>

    <key>RunAtLoad</key>
    <true/>

    <key>KeepAlive</key>
    <true/>

    <key>ThrottleInterval</key>
    <integer>10</integer>

    <key>StandardOutPath</key>
    <string>/Users/vex1/Code/archety-edge/logs/edge-agent.out.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/vex1/Code/archety-edge/logs/edge-agent.err.log</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>NODE_ENV</key>
        <string>production</string>
        <key>HOME</key>
        <string>/Users/vex1</string>
    </dict>

    <key>ProcessType</key>
    <string>Interactive</string>
</dict>
</plist>
```

### 4.2 Install and start

```bash
# Copy plist (repeat for each persona)
sudo cp com.archety.edge-vex.plist /Library/LaunchDaemons/
sudo chown root:wheel /Library/LaunchDaemons/com.archety.edge-vex.plist
sudo chmod 644 /Library/LaunchDaemons/com.archety.edge-vex.plist

# Load the daemon
sudo launchctl load /Library/LaunchDaemons/com.archety.edge-vex.plist

# Verify it's running
sudo launchctl list | grep archety
```

---

## Phase 5: Validate Everything Works

### 5.1 Confirm all agents are running

```bash
# Check all edge agent processes
ps aux | grep "node.*archety-edge" | grep -v grep

# Check all LaunchDaemons
sudo launchctl list | grep archety

# Hit each health endpoint
curl -s http://localhost:3001/health  # sage
curl -s http://localhost:3002/health  # vex
curl -s http://localhost:3003/health  # echo
curl -s http://localhost:3004/health  # kael
```

### 5.2 Send test messages

From a separate phone/device, send an iMessage to each persona's phone number. Verify:

- [ ] Message appears in edge agent logs for the correct persona
- [ ] Backend receives the message with correct `persona_id`
- [ ] Backend generates a response in the correct persona voice
- [ ] Response is delivered back via iMessage from the correct phone number

```bash
# Monitor logs in parallel (open separate terminal tabs)
tail -f /Users/sage1/Code/archety-edge/logs/edge-agent.out.log
tail -f /Users/vex1/Code/archety-edge/logs/edge-agent.out.log
tail -f /Users/echo1/Code/archety-edge/logs/edge-agent.out.log
```

### 5.3 Verify no cross-contamination

- Send "What's my name?" to Sage after telling Sage your name → should remember
- Send "What's my name?" to Vex (never told Vex) → should NOT know your name
- This validates per-persona memory namespace isolation

---

## Phase 6: Measure Resource Usage

This is the key data collection to determine scaling limits.

### 6.1 Baseline (before adding personas)

```bash
# Record baseline with only sage1 running
echo "=== BASELINE: 1 persona ==="
memory_pressure
vm_stat | head -5
ps aux --sort=-%mem | head -15
```

### 6.2 Incremental measurement

After adding each persona, record:

```bash
# After starting persona N
echo "=== $(ps aux | grep 'node.*archety-edge' | grep -v grep | wc -l) personas running ==="

# Memory pressure (green/yellow/red)
memory_pressure

# Per-process memory
ps aux | grep "node.*archety-edge" | grep -v grep | awk '{printf "%-10s %s MB\n", $1, $6/1024}'

# Total system memory
vm_stat | awk '
/Pages free/     {free=$3}
/Pages active/   {active=$3}
/Pages inactive/ {inactive=$3}
/Pages wired/    {wired=$4}
END {
  page=16384;
  printf "Free: %.0f MB\n", free*page/1048576;
  printf "Active: %.0f MB\n", active*page/1048576;
  printf "Wired: %.0f MB\n", wired*page/1048576;
}'

# Logged-in user sessions and their overhead
ps aux | grep loginwindow | grep -v grep | awk '{printf "%-10s %s MB (loginwindow)\n", $1, $6/1024}'
```

### 6.3 Stress test

Send messages to all personas simultaneously and check for:

```bash
# Watch CPU during concurrent messages
top -l 5 -s 2 -stats pid,command,cpu,mem | grep -E "node|messages-helper"

# Check for memory pressure changes
memory_pressure
```

### 6.4 Record results

Fill in this table with your actual measurements:

| Personas Running | memory_pressure | Total Node RSS | Total loginwindow RSS | Free RAM | Notes |
|-----------------|-----------------|----------------|----------------------|----------|-------|
| 1 (sage) | | | | | Baseline |
| 2 (+vex) | | | | | |
| 3 (+echo) | | | | | |
| 4 (+kael) | | | | | |
| 5 (+char5) | | | | | |
| 6 (+char6) | | | | | |

**Decision criteria:**
- `memory_pressure` stays **green** → safe to run this many personas
- `memory_pressure` turns **yellow** → approaching limit, usable but monitor closely
- `memory_pressure` turns **red** → too many personas for this hardware

---

## Phase 7: Reboot Resilience Test

After confirming all agents run, reboot the Mac mini and verify recovery.

### 7.1 Prepare for reboot

```bash
# Verify all LaunchDaemons are installed
ls -la /Library/LaunchDaemons/com.archety.edge-*.plist

# Verify plist syntax
for f in /Library/LaunchDaemons/com.archety.edge-*.plist; do
  echo "Checking $f..."
  plutil -lint "$f"
done
```

### 7.2 Reboot and verify

```bash
sudo reboot
```

After reboot:

1. **Log into all persona accounts via Fast User Switching.** This is mandatory — LaunchDaemons start the Node process, but AppleScript sending requires an active GUI session per user. Log into each account, then switch back to admin.

2. **Verify all agents recovered:**

```bash
# All agents should be running
sudo launchctl list | grep archety

# All health endpoints should respond
for port in 3001 3002 3003 3004; do
  echo "Port $port: $(curl -s -o /dev/null -w '%{http_code}' http://localhost:$port/health)"
done

# Send a test message to each persona and verify response
```

### 7.3 Known limitation: manual login after reboot

The biggest operational pain point: after every reboot, someone must log into each macOS user account via Fast User Switching (or VNC) to establish the GUI session. LaunchDaemons can start the Node process, but Messages.app/AppleScript won't work without a WindowServer session.

**Workaround options:**
- **VNC/Screen Sharing:** Enable Remote Management, SSH in, then VNC to each user
- **Startup script:** A script that uses `login` or `open -a` to trigger sessions (fragile)
- **Avoid reboots:** Use `caffeinate -s` to prevent sleep, only reboot for macOS updates

---

## Troubleshooting

### Agent starts but can't send messages

**Cause:** User session not active (logged out or never logged in after reboot).

```bash
# Check if the user has an active GUI session
who | grep vex1

# If missing, log into vex1 via Fast User Switching, then switch back
```

### Agent can't read chat.db

**Cause:** Full Disk Access not granted for the Node binary under that user.

```bash
# Log into the persona's account and check:
# System Settings → Privacy & Security → Full Disk Access
# Ensure /usr/local/bin/node (or your node path) is listed and checked
```

### Two agents conflict on the same port

**Cause:** Health check or admin portal port collision.

```bash
# Check what's using a port
lsof -i :3002

# Fix: Update the port in that persona's config.yaml and restart
sudo launchctl kickstart -k system/com.archety.edge-vex
```

### macOS logs out inactive users

**Cause:** macOS power management or security policy logging out switched-away users.

```bash
# Disable auto-logout
sudo defaults write /Library/Preferences/.GlobalPreferences com.apple.autologout.AutoLogOutDelay -int 0

# Disable display sleep (Mac minis don't have displays, but the setting matters)
sudo pmset -a displaysleep 0 sleep 0

# Prevent system sleep
caffeinate -s &
```

### Native Swift helper fails for a user

**Cause:** The messages-helper binary needs to be built under each user or have correct permissions.

```bash
# Option A: Build per-user
sudo -u vex1 bash -c "cd /Users/vex1/Code/archety-edge/native/messages-helper && swift build -c release"

# Option B: Share one binary but ensure read+execute permissions
chmod 755 /Users/sage1/Code/archety-edge/native/messages-helper/.build/release/messages-helper
```

---

## Port Assignment Reference

| Persona | macOS User | Health Port | Admin Port | LaunchDaemon Label |
|---------|-----------|-------------|------------|-------------------|
| Sage | sage1 | 3001 | 3100 | com.archety.edge-sage |
| Vex | vex1 | 3002 | 3101 | com.archety.edge-vex |
| Echo | echo1 | 3003 | 3102 | com.archety.edge-echo |
| Kael | kael1 | 3004 | 3103 | com.archety.edge-kael |
| Char 5 | char5 | 3005 | 3104 | com.archety.edge-char5 |
| Char 6 | char6 | 3006 | 3105 | com.archety.edge-char6 |

---

## Expected Resource Budget (M4 16GB)

| Component | Per Persona | 4 Personas | 6 Personas |
|-----------|------------|------------|------------|
| Node.js edge agent | ~200 MB | ~800 MB | ~1.2 GB |
| Swift messages-helper | ~30 MB | ~120 MB | ~180 MB |
| macOS user session (loginwindow, WindowServer share) | ~300 MB | ~1.2 GB | ~1.8 GB |
| SQLite databases | ~10 MB | ~40 MB | ~60 MB |
| **Subtotal** | **~540 MB** | **~2.2 GB** | **~3.2 GB** |
| macOS base (kernel, WindowServer, system) | — | ~4 GB | ~4 GB |
| **Total estimated** | — | **~6.2 GB** | **~7.2 GB** |
| **Remaining headroom** | — | **~9.8 GB** | **~8.8 GB** |

These are estimates — the measurements from Phase 6 will give you real numbers.

---

## Checklist Summary

- [ ] Phase 1: Create macOS user accounts for each persona
- [ ] Phase 2: Log into each account, sign into iMessage, verify chat.db exists
- [ ] Phase 3: Clone repo, configure config.yaml + .env, build per-user
- [ ] Phase 4: Install per-persona LaunchDaemons with unique ports and labels
- [ ] Phase 5: Verify all agents running, send test messages, confirm isolation
- [ ] Phase 6: Measure memory at 1, 2, 3, 4, 5, 6 personas — record in table
- [ ] Phase 7: Reboot, re-login all users, verify recovery
- [ ] Decision: green at 6 personas → proceed to production provisioning
