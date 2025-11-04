# Edge Agent - Complete Setup Guide

This guide will walk you through setting up the Mac mini edge agent from scratch.

## Prerequisites Checklist

Before you begin, make sure you have:

- [ ] Mac mini running macOS (this device)
- [ ] Messages.app configured with Apple ID
- [ ] Internet connection
- [ ] Admin access to this Mac
- [ ] Backend credentials (EDGE_SECRET and REGISTRATION_TOKEN)

## Step 1: Install Xcode Command Line Tools

This is required for Node.js and development tools.

```bash
xcode-select --install
```

A dialog will appear - click "Install" and wait for it to complete (~10-15 minutes).

**Verify installation:**
```bash
xcode-select -p
# Should output: /Library/Developer/CommandLineTools
```

## Step 2: Install Node.js

### Option A: Using Homebrew (Recommended)

If you don't have Homebrew yet:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Then install Node.js:
```bash
brew install node
```

### Option B: Using nvm (Node Version Manager)

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Reload shell
source ~/.bashrc  # or ~/.zshrc

# Install Node.js
nvm install 18
nvm use 18
```

**Verify installation:**
```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

## Step 3: Install Project Dependencies

```bash
cd /Users/sage1/Code/edge-relay
npm install
```

This will install all required packages (axios, better-sqlite3, etc.).

## Step 4: Configure Environment

### Create .env file

```bash
cp .env.example .env
nano .env
```

Add your credentials:
```bash
EDGE_SECRET=<get_this_from_backend_team>
REGISTRATION_TOKEN=<get_this_from_backend_team>
```

**Where to get these values:**
- Ask the backend engineer for `EDGE_SECRET` (shared secret for HMAC)
- Ask for `REGISTRATION_TOKEN` (initial auth token)

### Update config.yaml

```bash
nano config.yaml
```

Update the phone number:
```yaml
edge:
  user_phone: "+15551234567"  # Change to your actual phone
```

## Step 5: Grant macOS Permissions

### Full Disk Access (Required)

This allows the edge agent to read the Messages database.

1. Open **System Preferences**
2. Go to **Security & Privacy** → **Privacy**
3. Select **Full Disk Access** from the left sidebar
4. Click the lock 🔒 icon to make changes (enter your password)
5. Click the **+** button
6. Navigate to `/Applications/Utilities/`
7. Select **Terminal.app** (or iTerm if you use that)
8. Click **Open**

**Verify:**
```bash
sqlite3 ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message;"
```

If you see a number, it's working! If you see "attempt to write a readonly database" or permission errors, Full Disk Access isn't granted yet.

### Automation Permission (Required)

This allows AppleScript to control Messages.app.

1. Open **System Preferences**
2. Go to **Security & Privacy** → **Privacy**
3. Select **Automation** from the left sidebar
4. Find **Terminal** (or iTerm) in the list
5. Check the box next to **Messages**

**If Automation doesn't appear yet:** It will appear after the first time the edge agent tries to send a message. You'll see a dialog - click "OK" to allow.

## Step 6: Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

## Step 7: Test Run

Start the edge agent in development mode:

```bash
npm run dev
```

You should see:
```
============================================================
Starting Edge Agent v1.0.0 (Phase 1: Transport)
============================================================
Registering with backend...
✅ Registered as: edge_15551234567
Starting iMessage transport...
✅ Transport ready
✅ Backend is healthy
============================================================
✅ Edge Agent is running!
Polling for messages every 5s
Press Ctrl+C to stop
============================================================
```

### Test Sending a Message

From your iPhone, send an iMessage to the phone number/Apple ID configured on this Mac mini:
```
Hey Sage, are you there?
```

Watch the terminal logs - you should see:
```
📬 Processing 1 new message(s)
Processing message from +15551234567
📤 Sending response to iMessage;-;+15551234567
✅ Response sent successfully
```

And you should receive a response on your iPhone from Sage!

Press `Ctrl+C` to stop the agent.

## Step 8: Run in Production Mode

Once testing works:

```bash
npm start
```

This runs the compiled version from `dist/`.

## Step 9: Auto-Start on Boot (Optional)

To have the edge agent start automatically when the Mac mini boots:

### Install LaunchAgent

```bash
# Copy the plist file
cp com.archety.edge-agent.plist ~/Library/LaunchAgents/

# Load the service
launchctl load ~/Library/LaunchAgents/com.archety.edge-agent.plist
```

### Verify it's running

```bash
launchctl list | grep archety
```

You should see:
```
-	0	com.archety.edge-agent
```

### View logs

```bash
tail -f /Users/sage1/Code/edge-relay/edge-agent-stdout.log
```

### Stop the service

```bash
launchctl unload ~/Library/LaunchAgents/com.archety.edge-agent.plist
```

### Restart the service

```bash
launchctl unload ~/Library/LaunchAgents/com.archety.edge-agent.plist
launchctl load ~/Library/LaunchAgents/com.archety.edge-agent.plist
```

## Troubleshooting

### "Cannot read Messages database"

**Problem:** Edge agent can't access `~/Library/Messages/chat.db`

**Solution:**
1. Grant Full Disk Access (see Step 5)
2. Restart Terminal
3. Test: `sqlite3 ~/Library/Messages/chat.db "SELECT 1;"`

### "Messages.app is not accessible"

**Problem:** AppleScript can't control Messages

**Solution:**
1. Make sure Messages.app is **running** and signed in
2. Grant Automation permission (see Step 5)
3. Try sending a test message - a dialog should appear asking for permission

### "Backend returns 401 Unauthorized"

**Problem:** Authentication failing

**Solution:**
1. Check `.env` file has correct `EDGE_SECRET`
2. Verify backend is running: `curl https://archety-backend.onrender.com/health`
3. Re-register:
   ```bash
   rm edge-agent.db
   npm start
   ```

### "npm: command not found"

**Problem:** Node.js not installed or not in PATH

**Solution:**
1. Install Node.js (see Step 2)
2. Restart terminal
3. Verify: `which node`

### Edge agent crashes immediately

**Problem:** Configuration error or missing permissions

**Solution:**
1. Check logs: `cat edge-agent.log`
2. Run in dev mode to see detailed errors: `npm run dev`
3. Verify config.yaml has correct phone number
4. Verify .env has credentials

## Next Steps

Once the edge agent is running successfully:

1. **Monitor logs** regularly:
   ```bash
   tail -f edge-agent.log
   ```

2. **Test with different message types**:
   - 1:1 direct messages
   - Group chats
   - Different lengths and content

3. **Set up monitoring** (future):
   - Dashboard for edge agent status
   - Alerts for downtime

4. **Phase 2 development**:
   - Privacy filtering
   - PII redaction
   - Local scheduling

## Architecture Notes

### Current Implementation (Phase 1)

- **Transport Only**: Messages flow through but no filtering yet
- **Node.js + AppleScript**: Easy to develop and debug
- **Modular Design**: Ready for Swift migration later

### Future Phases

- **Phase 2**: Add privacy filtering and PII redaction
- **Phase 3**: Add local scheduling (SQLite-based)
- **Phase 4**: Full sync protocol with commands/events
- **Phase 5**: Swift rewrite of transport layer for performance

## Support

- **Logs Location**: `./edge-agent.log`
- **Backend API Docs**: https://archety-backend.onrender.com/docs
- **Technical Docs**: See `EDGE_AGENT_SPEC.md` and `ARCHITECTURE.md`

## Quick Reference

```bash
# Install dependencies
npm install

# Build project
npm run build

# Run in development mode (with auto-reload)
npm run dev

# Run in production mode
npm start

# View logs
tail -f edge-agent.log

# Check if running as service
launchctl list | grep archety

# Restart service
launchctl unload ~/Library/LaunchAgents/com.archety.edge-agent.plist
launchctl load ~/Library/LaunchAgents/com.archety.edge-agent.plist
```
