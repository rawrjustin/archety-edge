# Quick Install Guide

## TL;DR - Get Running in 10 Minutes

### 1. Install Node.js

```bash
# Install Xcode Command Line Tools (if prompted, click Install in dialog)
xcode-select --install

# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Verify
node --version  # Should show v18+ or higher
```

### 2. Install Dependencies

```bash
cd /Users/sage1/Code/edge-relay
npm install
```

### 3. Configure

```bash
# Create .env file
cp .env.example .env

# Edit with your credentials (get from backend team)
nano .env
```

Add:
```
EDGE_SECRET=<from_backend_team>
REGISTRATION_TOKEN=<from_backend_team>
```

```bash
# Update phone number in config
nano config.yaml
```

Change `user_phone: "+15551234567"` to your actual phone.

### 4. Grant Permissions

**Full Disk Access:**
- System Preferences → Security & Privacy → Privacy → Full Disk Access
- Add Terminal.app

**Test:**
```bash
sqlite3 ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message;"
```

### 5. Build & Run

```bash
# Build
npm run build

# Run
npm start
```

### 6. Test

Send an iMessage to the Mac mini's Apple ID from your iPhone:
```
Hey Sage!
```

You should get a response back!

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm: command not found` | Install Node.js (step 1) |
| Cannot read Messages DB | Grant Full Disk Access (step 4) |
| AppleScript errors | Make sure Messages.app is running |
| 401 Unauthorized | Check EDGE_SECRET in .env |

## Full Setup Guide

For detailed instructions, see [SETUP_GUIDE.md](./SETUP_GUIDE.md)

## Auto-Start on Boot

```bash
cp com.archety.edge-agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.archety.edge-agent.plist
```

## Getting Help

- View logs: `tail -f edge-agent.log`
- Backend API: https://archety-backend.onrender.com/docs
- See: `SETUP_GUIDE.md` for detailed troubleshooting
