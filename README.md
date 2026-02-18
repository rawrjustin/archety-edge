# Edge Relay - Mac Mini iMessage Agent

Intelligent edge agent that bridges iMessage with a cloud backend, enabling message processing, scheduling, and fast responses with privacy-first design.

## Features

- ✅ **iMessage Integration** - Monitor and send iMessages via Messages.app
- ✅ **Backend Sync** - Bidirectional communication with cloud orchestrator
- ✅ **Message Scheduling** - SQLite-based local scheduling (works offline)
- ✅ **Fast Reflex Responses** - Immediate reactions (<100ms) with delayed elaboration
- ✅ **Performance Optimized** - 5× faster sends, 60% less CPU, parallel processing
- ✅ **HMAC Authentication** - Secure backend communication
- ✅ **Clean Architecture** - Interface-based design for easy testing and Swift migration

## Quick Start

```bash
# 1. Install dependencies
brew install node
cd /Users/sage1/Code/edge-relay
npm install

# 2. Configure
cp .env.example .env
nano .env  # Add EDGE_SECRET and REGISTRATION_TOKEN
nano config.yaml  # Set your phone number

# 3. Grant permissions
# System Settings → Privacy & Security → Full Disk Access → Add Terminal
# System Settings → Privacy & Security → Automation → Terminal → Messages

# 4. Build and run
npm run build
./edge-agent.sh start

# 5. Check status
./edge-agent.sh status
./edge-agent.sh logs -f
```

**See [Getting Started Guide](docs/setup/GETTING_STARTED.md) for detailed setup.**

## 🎛️ Admin Portal

A comprehensive web-based admin portal is now available for managing and monitoring the Edge Agent without SSH or terminal access.

**Quick Start:**
```bash
# Install and build
npm install
npm run admin:install
npm run admin:build

# Start with admin portal
npm run admin
```

Access at: **http://127.0.0.1:3100**

**Features:**
- 📊 Real-time dashboard with stats and uptime monitoring
- 📋 Live log viewer with filtering and streaming
- ⚙️ Configuration editor for config.yaml
- 📅 Scheduled messages manager
- 🎯 Rules manager (enable/disable rules)
- 🗺️ Conversation plans viewer
- 🧪 Test tools for debugging and message testing
- 🔄 Service control (restart from web interface)

See [admin-portal/README.md](./admin-portal/README.md) for full documentation.

## Management

### Manual Mode (edge-agent.sh)
```bash
./edge-agent.sh start      # Start in background
./edge-agent.sh stop       # Stop gracefully
./edge-agent.sh restart    # Restart
./edge-agent.sh status     # Check if running
./edge-agent.sh logs       # View last 50 lines
./edge-agent.sh logs -f    # Live tail logs
```

### Auto-Start Service (LaunchDaemon)

The edge agent can run as a system service that starts automatically on boot:

```bash
# Install service (builds and enables auto-start)
npm run service:install

# Check service status
npm run service:status

# View service logs
npm run service:logs          # Live tail stdout
npm run service:errors        # Live tail stderr

# Restart service
npm run service:restart

# Uninstall service
npm run service:uninstall
```

**Service Details:**
- Starts automatically on Mac boot
- Restarts automatically if it crashes
- Runs in background as system daemon
- Logs to `logs/edge-agent.out.log` and `logs/edge-agent.err.log`

**See [Auto-Start Guide](docs/setup/AUTO_START.md) for details.**

### Multi-Persona Setup

Run multiple personas (Sage, Vex, Echo, Kael, etc.) on a single Mac mini, each with its own phone number:

```bash
# Provision a new persona in one command
sudo ./setup-persona.sh \
  --persona-id vex \
  --phone "+14155559876" \
  --edge-secret "your_shared_secret"

# View all provisioned personas and their status
./list-personas.sh

# Remove a persona
sudo ./teardown-persona.sh --persona-id vex
sudo ./teardown-persona.sh --persona-id vex --delete-user  # also remove macOS account
```

`setup-persona.sh` automates: macOS user creation, repo clone, dependency install, native helper build, `config.yaml` and `.env` generation with auto-assigned unique ports, and LaunchDaemon installation. After running it, follow the printed checklist for manual steps (Fast User Switching login, iMessage sign-in, macOS permissions).

**See [Multi-Persona Setup Guide](docs/setup/MULTI_PERSONA_EDGE_SETUP.md) for architecture details and validation steps.**

## Performance

The edge relay includes extensive performance optimizations:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| CPU (idle) | ~15% | ~5% | **60-70% reduction** |
| 5-bubble send | 1500-2000ms | 200-400ms | **5× faster** |
| Backend latency | 300-500ms | 200-350ms | **20-30% faster** |
| Message throughput | Sequential | 3 concurrent | **2-3× faster** |

### Performance Profiles

Configure in `config.yaml`:

```yaml
performance:
  profile: "balanced"  # or "low-latency" or "low-resource"
```

- **Balanced** (default) - Best for most cases
- **Low-Latency** - Fastest responses (1s poll, 30s sync)
- **Low-Resource** - Minimal CPU (5s poll, 2min sync)

**See [Performance Guide](docs/architecture/PERFORMANCE.md) for details.**

## Architecture

```
iMessage ↔ MessagesDB ↔ EdgeAgent ↔ Backend (HTTPS)
                          ↕
                      Scheduler
                      (SQLite)
```

**Key Components:**
- **Transport** - Messages database polling & AppleScript sending
- **Backend Client** - HTTP client with HMAC auth & connection pooling
- **Scheduler** - SQLite-based message scheduling
- **Command Handler** - Process backend commands
- **Main Loop** - Orchestrates polling, syncing, and processing

**See [Architecture Overview](docs/architecture/OVERVIEW.md) for details.**

## Documentation

### Setup
- [Getting Started](docs/setup/GETTING_STARTED.md) - Quick 15-minute setup
- [Multi-Persona Setup](docs/setup/MULTI_PERSONA_EDGE_SETUP.md) - Run multiple personas on one Mac
- [Configuration Guide](docs/setup/CONFIGURATION.md) - Performance tuning
- [Troubleshooting](docs/setup/TROUBLESHOOTING.md) - Common issues

### Architecture
- [Overview](docs/architecture/OVERVIEW.md) - System design
- [API Specification](docs/architecture/API_SPEC.md) - Backend protocol
- [Performance](docs/architecture/PERFORMANCE.md) - Optimization details
- [Reflex Implementation](docs/architecture/REFLEX_IMPLEMENTATION.md) - Fast responses

## Project Structure

```
edge-relay/
├── src/
│   ├── index.ts              # Main application
│   ├── config.ts             # Configuration loader
│   ├── interfaces/           # TypeScript interfaces
│   ├── transports/           # iMessage integration
│   ├── backend/              # Backend client + auth
│   ├── scheduler/            # Message scheduling
│   ├── commands/             # Command handling
│   └── utils/                # Logging
├── docs/                     # Documentation
├── __tests__/                # Unit tests
├── config.yaml               # Runtime configuration
├── .env                      # Secrets (not in git)
├── edge-agent.sh             # Single-agent management script
├── setup-persona.sh          # Provision a new persona (multi-agent)
├── teardown-persona.sh       # Remove a persona
├── list-personas.sh          # Show all personas and status
└── package.json              # Dependencies
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode (with auto-reload)
npm run dev

# Build TypeScript
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint
npm run lint  # (if configured)
```

**Current Test Coverage:** 73.74% (144 passing tests)

## Configuration

### config.yaml (Runtime)

```yaml
edge:
  user_phone: "+1234567890"

backend:
  url: "https://archety-backend.onrender.com"
  sync_interval_seconds: 60

imessage:
  poll_interval_seconds: 2
  db_path: "~/Library/Messages/chat.db"

performance:
  profile: "balanced"

logging:
  level: "info"
  file: "./edge-agent.log"
```

### .env (Secrets)

```env
EDGE_SECRET=your_shared_secret_here
REGISTRATION_TOKEN=your_registration_token
```

## Requirements

- macOS 12+ (Monterey or later)
- Node.js 18+
- Messages.app configured with Apple ID
- Full Disk Access permission
- Automation permission for Messages.app

## Security

- **HMAC-SHA256** authentication for all backend requests
- **HTTPS** for all network communication
- **Full Disk Access** required (read-only access to Messages DB)
- **No permanent storage** of message content (except scheduled messages)

## Troubleshooting

**Common issues:**

- **Can't read Messages DB** → Grant Full Disk Access to Terminal
- **AppleScript errors** → Grant Automation permission
- **401 Unauthorized** → Check EDGE_SECRET in .env
- **High CPU** → Switch to low-resource profile

**See [Troubleshooting Guide](docs/setup/TROUBLESHOOTING.md) for solutions.**

## Roadmap

### MVP Complete ✅
- Phase 1: Basic message relay
- Phase 2: Scheduler + Transport
- **Phase 3: Adaptive Scheduler** - Near-instant delivery (<20ms precision)
- Performance optimizations (5× faster sends, 60% less CPU)
- Fast reflex responses (1s message detection)
- Batch AppleScript execution
- WebSocket real-time commands
- Production-ready with LaunchDaemon auto-start

**Status:** Feature-complete and ready for production use

### Future Considerations (V2)
Future versions may explore:
- Native Swift/Objective-C bridge for direct macOS API access
- Event-driven message detection (FSEvents or notifications)
- Enhanced monitoring and metrics endpoints

## License

Proprietary - Archety

## Support

- Documentation: `docs/` folder
- Issues: Check logs with `./edge-agent.sh logs`
- Configuration help: [Configuration Guide](docs/setup/CONFIGURATION.md)
- Backend API: `https://archety-backend.onrender.com/docs`
