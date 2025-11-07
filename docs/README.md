# Edge Relay Documentation

Complete documentation for the Edge Relay iMessage agent.

## Quick Links

**Getting Started:**
- [Quick Start Guide](setup/GETTING_STARTED.md) - Set up in 15 minutes
- [Auto-Start Guide](setup/AUTO_START.md) - Run as system service
- [Configuration Guide](setup/CONFIGURATION.md) - Performance tuning
- [Troubleshooting](setup/TROUBLESHOOTING.md) - Common issues

**Architecture:**
- [System Overview](architecture/OVERVIEW.md) - How it works
- [API Specification](architecture/API_SPEC.md) - Backend protocol
- [Performance Details](architecture/PERFORMANCE.md) - Optimizations
- [Reflex Implementation](architecture/REFLEX_IMPLEMENTATION.md) - Fast responses

## Documentation Structure

```
docs/
├── setup/                    # Setup and configuration
│   ├── GETTING_STARTED.md   # Quick setup guide
│   ├── AUTO_START.md         # Auto-start on boot
│   ├── CONFIGURATION.md      # Config options and tuning
│   └── TROUBLESHOOTING.md    # Common issues and solutions
│
└── architecture/             # Technical documentation
    ├── OVERVIEW.md           # System design
    ├── API_SPEC.md           # Backend protocol
    ├── PERFORMANCE.md        # Performance details
    └── REFLEX_IMPLEMENTATION.md  # Fast reflex protocol
```

## For Different Audiences

### I just want to run it
→ [Getting Started](setup/GETTING_STARTED.md)

### I want it to auto-start on boot
→ [Auto-Start Guide](setup/AUTO_START.md)

### I need to configure it
→ [Configuration Guide](setup/CONFIGURATION.md)

### It's not working
→ [Troubleshooting](setup/TROUBLESHOOTING.md)

### I want to understand how it works
→ [Architecture Overview](architecture/OVERVIEW.md)

### I'm integrating the backend
→ [API Specification](architecture/API_SPEC.md)

### I want to optimize performance
→ [Performance Guide](architecture/PERFORMANCE.md)

### I want to implement fast reflexes
→ [Reflex Implementation](architecture/REFLEX_IMPLEMENTATION.md)

## Key Concepts

### Edge Agent
The Node.js application running on Mac mini that:
- Monitors iMessage for new messages
- Forwards messages to backend
- Sends responses via iMessage
- Schedules messages locally
- Processes backend commands

### Transport
Component that interacts with iMessage:
- **MessagesDB** - Reads from Messages database
- **AppleScriptSender** - Sends via AppleScript
- **Optimizations** - Batch sends, pre-checks, parallel processing

### Backend Client
HTTP client for backend communication:
- HMAC authentication
- Connection pooling
- Health checking
- Command/event sync

### Scheduler
SQLite-based local scheduling:
- Schedule messages for future delivery
- Works offline (no backend dependency)
- Persistent storage
- Command-driven

### Reflex System
Fast response mechanism:
- **Reflex** - Immediate short reaction (~100ms)
- **Burst** - Follow-up messages after delay (2s)
- Natural conversation flow

## Performance

The edge relay includes extensive optimizations:

- **5× faster** multi-bubble sends (batched AppleScript)
- **60-70% less CPU** during idle (database pre-checks)
- **2-3× throughput** (parallel message processing)
- **20-30% faster** backend calls (connection pooling)

See [Performance Guide](architecture/PERFORMANCE.md) for details.

## Support

- **Logs**: `./edge-agent.sh logs -f`
- **Status**: `./edge-agent.sh status`
- **Config**: `cat config.yaml`
- **Troubleshooting**: [Troubleshooting Guide](setup/TROUBLESHOOTING.md)

## Contributing

See main [README](../README.md) for development setup.

## Updates

Check [Architecture Overview](architecture/OVERVIEW.md) for roadmap and future enhancements.
