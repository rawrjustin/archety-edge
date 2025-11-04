# Edge Agent - Mac Mini iMessage Relay

Phase 1 implementation of the intelligent edge agent that relays iMessages to the Sage backend on Render.

## Features (Phase 1)

- ✅ **iMessage Monitoring**: Poll Messages DB for new incoming messages
- ✅ **iMessage Sending**: Send messages via AppleScript
- ✅ **Backend Integration**: Forward messages to Render backend
- ✅ **HMAC Authentication**: Secure communication with backend
- ✅ **Clean Architecture**: Interface-based design for easy Swift migration

## Prerequisites

1. **Node.js 18+** and npm
2. **Xcode Command Line Tools**: `xcode-select --install`
3. **Messages.app** configured with Apple ID
4. **Full Disk Access** for Terminal/iTerm
5. **Automation permissions** for Terminal to control Messages

## Installation

### 1. Install Node.js

If Node.js isn't installed:

```bash
# Using Homebrew
brew install node

# Or using nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

### 2. Install Dependencies

```bash
cd /Users/sage1/Code/edge-relay
npm install
```

### 3. Configure

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your credentials
nano .env
```

Required environment variables:
- `EDGE_SECRET`: Shared secret for HMAC authentication (get from backend team)
- `REGISTRATION_TOKEN`: Initial registration token

Edit `config.yaml`:
- Update `edge.user_phone` with your phone number (e.g., `+15551234567`)

### 4. Grant Permissions

**Full Disk Access** (required to read Messages DB):
1. System Preferences → Security & Privacy → Privacy
2. Select "Full Disk Access"
3. Click the lock to make changes
4. Add Terminal (or iTerm)

**Automation** (required for AppleScript):
1. System Preferences → Security & Privacy → Privacy
2. Select "Automation"
3. Allow Terminal to control "Messages"

### 5. Build

```bash
npm run build
```

## Running

### Quick Start - Background Service (Recommended)

The edge agent includes a management script for easy background operation:

```bash
# Start the service
./edge-agent.sh start

# Stop the service
./edge-agent.sh stop

# Restart the service
./edge-agent.sh restart

# Check status
./edge-agent.sh status

# View logs (last 50 lines)
./edge-agent.sh logs

# Live tail logs
./edge-agent.sh logs -f
```

This is ideal for running via SSH or on a headless Mac Mini.

### Development Mode (with auto-reload)

```bash
npm run dev
```

### Production Mode (Direct)

```bash
npm start
```

## Project Structure

```
edge-relay/
├── src/
│   ├── index.ts                     # Main application
│   ├── config.ts                    # Configuration loader
│   ├── interfaces/                  # Abstract interfaces
│   │   ├── IMessageTransport.ts
│   │   ├── IBackendClient.ts
│   │   └── ILogger.ts
│   ├── transports/                  # iMessage implementations
│   │   ├── AppleScriptTransport.ts  # Combined transport
│   │   ├── MessagesDB.ts            # DB monitoring
│   │   └── AppleScriptSender.ts     # Message sending
│   ├── backend/                     # Backend integration
│   │   ├── RenderClient.ts          # API client
│   │   └── auth.ts                  # HMAC authentication
│   └── utils/
│       └── logger.ts                # Logging system
├── config.yaml                      # Runtime configuration
├── package.json
└── README.md
```

## Configuration

### config.yaml

```yaml
edge:
  user_phone: "+15551234567"  # Your phone number

backend:
  url: "https://archety-backend.onrender.com"
  sync_interval_seconds: 60

imessage:
  poll_interval_seconds: 5
  db_path: "~/Library/Messages/chat.db"

logging:
  level: "info"  # debug, info, warn, error
  file: "./edge-agent.log"
```

### Environment Variables (.env)

```bash
EDGE_SECRET=your_shared_secret_here
REGISTRATION_TOKEN=edge_initial_token
```

## SSH Convenience Aliases (Optional)

For easier management via SSH, add these aliases to `~/.zshrc` or `~/.bash_profile`:

```bash
alias edge-start='cd ~/code/edge-relay && ./edge-agent.sh start'
alias edge-stop='cd ~/code/edge-relay && ./edge-agent.sh stop'
alias edge-restart='cd ~/code/edge-relay && ./edge-agent.sh restart'
alias edge-status='cd ~/code/edge-relay && ./edge-agent.sh status'
alias edge-logs='cd ~/code/edge-relay && ./edge-agent.sh logs'
alias edge-tail='cd ~/code/edge-relay && ./edge-agent.sh logs -f'
```

Then reload your shell:
```bash
source ~/.zshrc  # or ~/.bash_profile
```

Now you can use simple commands like `edge-status` from anywhere!

## Auto-Start with LaunchAgent

The edge agent includes a launchd service for automatic startup. The plist is located at:
- `~/Library/LaunchAgents/com.sage.edge-relay.plist`

To enable auto-start on login:

```bash
# Load the service (auto-start disabled by default)
launchctl load ~/Library/LaunchAgents/com.sage.edge-relay.plist

# Start the service manually
launchctl start com.sage.edge-relay

# Check status
launchctl list | grep edge-relay

# To enable auto-start on boot, edit the plist:
# Change <key>RunAtLoad</key><false/> to <true/>
```

Note: The edge-agent.sh script is the recommended way to manage the service.

## Logging

Logs are written to:
- **Console**: stdout/stderr (when running directly)
- **File**: `./edge-agent.log` (when using edge-agent.sh script)
- **LaunchAgent logs**: `./logs/edge-relay.log` and `./logs/edge-relay-error.log`

View logs in real-time:
```bash
# Using the management script (recommended)
./edge-agent.sh logs -f

# Or directly
tail -f edge-agent.log
```

## Memory Optimization for Mac Mini

When running as a dedicated edge relay server, you can optimize memory usage:

### Kill Unnecessary macOS Processes

```bash
# Kill widget extensions and non-essential processes
killall Messages
killall "Activity Monitor"
killall Spotlight

# Disable Notification Center widgets
defaults write com.apple.notificationcenterui ShowWidgets -bool false
killall NotificationCenter
```

### Running Headless (No Monitor)

The edge agent runs efficiently without a monitor connected:
- Memory savings: ~100-150MB
- CPU savings: ~5-10% (no rendering/display)
- WindowServer still runs but uses minimal resources

Access via SSH for management:
```bash
ssh user@mac-mini-ip
edge-status  # If using aliases
```

### Memory Footprint

The edge agent typically uses:
- **Node process**: ~55-60MB
- **npm wrapper**: ~60MB
- **Total**: ~115-120MB

After optimization, typical free memory: 1.5GB+ on 16GB Mac Mini

## Troubleshooting

### "Cannot read Messages database"

**Solution**: Grant Full Disk Access to Terminal
1. System Preferences → Security & Privacy → Privacy → Full Disk Access
2. Add Terminal.app

### "AppleScript not working"

**Solution**: Grant Automation permission
1. System Preferences → Security & Privacy → Privacy → Automation
2. Allow Terminal to control Messages

### "Backend returns 401 Unauthorized"

**Solution**: Check EDGE_SECRET matches backend
1. Verify `.env` file has correct `EDGE_SECRET`
2. Re-register: `rm edge-agent.db && npm start`

### "Messages.app is not accessible"

**Solution**: Make sure Messages.app is running and signed in

## Architecture Notes

### Clean Interfaces for Swift Migration

All transport, backend, and logging logic is behind interfaces, making it easy to:
1. Keep using Node.js for main loop and backend protocol
2. Swap just the `IMessageTransport` implementation to Swift
3. Maintain backward compatibility

### Future Phases

- **Phase 2**: Privacy filtering & PII redaction
- **Phase 3**: Local scheduling (SQLite-based)
- **Phase 4**: Full sync protocol with backend

## Support

- **Backend API**: https://archety-backend.onrender.com/docs
- **Docs**: See `EDGE_AGENT_SPEC.md` and `MAC_MINI_IMPLEMENTATION.md`

## License

Proprietary - Archety
