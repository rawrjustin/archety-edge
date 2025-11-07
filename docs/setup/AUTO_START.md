# Auto-Start Configuration Guide

This guide explains how to configure the Edge Agent to start automatically when your Mac boots up.

## Overview

The Edge Agent uses macOS LaunchDaemon to run as a system service that:
- Starts automatically on boot
- Restarts automatically if it crashes
- Runs in the background continuously
- Logs all output for monitoring

## Quick Setup

### 1. Install the Service

```bash
npm run service:install
```

This command will:
1. Build the TypeScript project (`npm run build`)
2. Create the logs directory
3. Install the LaunchDaemon plist file
4. Load and start the service

### 2. Verify Installation

```bash
npm run service:status
```

You should see output like:
```
12345    0    com.sage.edge-agent
```

### 3. Monitor Logs

```bash
# View live stdout logs
npm run service:logs

# View live error logs
npm run service:errors
```

## Management Commands

All service management is done through npm scripts:

| Command | Description |
|---------|-------------|
| `npm run service:install` | Build and install the service |
| `npm run service:uninstall` | Stop and remove the service |
| `npm run service:status` | Check if service is running |
| `npm run service:logs` | Live tail stdout logs |
| `npm run service:errors` | Live tail error logs |
| `npm run service:restart` | Restart the service |

## Advanced Management

### Manual LaunchControl Commands

If you need more control, you can use `launchctl` directly:

```bash
# List all LaunchDaemons (find edge-agent)
sudo launchctl list | grep edge-agent

# Stop the service
sudo launchctl unload /Library/LaunchDaemons/com.sage.edge-agent.plist

# Start the service
sudo launchctl load /Library/LaunchDaemons/com.sage.edge-agent.plist

# Bootstrap the service (for newer macOS versions)
sudo launchctl bootstrap system /Library/LaunchDaemons/com.sage.edge-agent.plist

# Remove the service (for newer macOS versions)
sudo launchctl bootout system/com.sage.edge-agent
```

## Configuration

The LaunchDaemon is configured in `com.sage.edge-agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sage.edge-agent</string>

    <!-- Start on boot -->
    <key>RunAtLoad</key>
    <true/>

    <!-- Restart if crashes -->
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
        <key>Crashed</key>
        <true/>
    </dict>

    <!-- Wait 10 seconds before restarting -->
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>
```

### Key Settings

- **RunAtLoad**: Service starts when system boots
- **KeepAlive**: Service restarts if it crashes
- **ThrottleInterval**: Wait 10 seconds before restarting (prevents rapid restart loops)
- **ProcessType**: Set to "Interactive" to allow GUI interactions (AppleScript)
- **StandardOutPath**: Logs stdout to `logs/edge-agent.out.log`
- **StandardErrorPath**: Logs stderr to `logs/edge-agent.err.log`

## Log Files

### Location

All logs are stored in the project's `logs/` directory:

```
edge-relay/logs/
├── edge-agent.out.log    # Standard output (normal operation)
├── edge-agent.err.log    # Standard error (errors and warnings)
└── edge-agent.log        # Application-level logs (from Logger)
```

### Viewing Logs

```bash
# Live tail stdout (most useful)
npm run service:logs

# Live tail errors
npm run service:errors

# View last 50 lines of stdout
tail -n 50 logs/edge-agent.out.log

# View last 50 lines of errors
tail -n 50 logs/edge-agent.err.log

# Search for specific text
grep "error" logs/edge-agent.err.log
```

### Log Rotation

LaunchDaemon logs can grow large over time. Consider setting up log rotation:

```bash
# Create logrotate config
sudo nano /etc/newsyslog.d/edge-agent.conf
```

Add:
```
/Users/sage1/Code/edge-relay/logs/edge-agent.*.log    644  7  100  *  GZ
```

This rotates logs daily, keeps 7 backups, max 100MB per file.

## Troubleshooting

### Service Won't Start

1. **Check if service is loaded:**
   ```bash
   sudo launchctl list | grep edge-agent
   ```

2. **Check error logs:**
   ```bash
   npm run service:errors
   ```

3. **Verify build is up to date:**
   ```bash
   npm run build
   ls -la dist/index.js
   ```

4. **Check permissions:**
   ```bash
   ls -la /Library/LaunchDaemons/com.sage.edge-agent.plist
   # Should be: -rw-r--r--  1 root  wheel
   ```

### Service Keeps Crashing

1. **Check error logs:**
   ```bash
   npm run service:errors
   ```

2. **Test manual start:**
   ```bash
   npm run service:uninstall
   npm start
   # If this works, the code is fine
   ```

3. **Check environment variables:**
   - Verify `.env` file exists and has correct values
   - Check `config.yaml` is properly configured

4. **Verify permissions:**
   - Full Disk Access for `/usr/local/bin/node`
   - Automation permission for Messages.app

### Service Not Auto-Starting on Boot

1. **Verify plist is in correct location:**
   ```bash
   ls -la /Library/LaunchDaemons/com.sage.edge-agent.plist
   ```

2. **Check plist syntax:**
   ```bash
   plutil -lint /Library/LaunchDaemons/com.sage.edge-agent.plist
   ```

3. **Verify RunAtLoad is true:**
   ```bash
   grep -A 1 "RunAtLoad" /Library/LaunchDaemons/com.sage.edge-agent.plist
   ```

4. **Check system logs:**
   ```bash
   log show --predicate 'subsystem == "com.apple.launchd"' --last 10m | grep edge-agent
   ```

### Permission Issues

If you see "Operation not permitted" errors:

1. **Grant Full Disk Access to Node:**
   - System Settings → Privacy & Security → Full Disk Access
   - Add `/usr/local/bin/node`

2. **Grant Automation permissions:**
   - System Settings → Privacy & Security → Automation
   - Allow node to control Messages

### Logs Not Appearing

1. **Check logs directory exists:**
   ```bash
   ls -la logs/
   ```

2. **Create logs directory if missing:**
   ```bash
   mkdir -p logs
   ```

3. **Check log file permissions:**
   ```bash
   ls -la logs/edge-agent.*.log
   ```

## Updating the Service

When you make code changes:

```bash
# Option 1: Restart service (rebuilds and reloads)
npm run service:restart

# Option 2: Manual update
npm run build
sudo launchctl kickstart -k system/com.sage.edge-agent
```

## Uninstalling

To completely remove the auto-start service:

```bash
npm run service:uninstall
```

This will:
1. Stop the service
2. Unload the LaunchDaemon
3. Remove the plist file from `/Library/LaunchDaemons/`

The project files and logs remain intact.

## Security Considerations

### System Access

The LaunchDaemon runs with user privileges (not root) and requires:
- Full Disk Access to read Messages database
- Automation permission to control Messages.app

### Secrets Management

The service loads secrets from:
1. `.env` file (EDGE_SECRET, REGISTRATION_TOKEN)
2. `config.yaml` (backend URL, phone number)

**Important:** These files must exist in the working directory and be readable by the user running the service.

### Network Security

All backend communication uses:
- HTTPS encryption
- HMAC-SHA256 authentication
- Connection pooling with keep-alive

## Monitoring

### Health Checks

Monitor service health:

```bash
# Check if process is running
npm run service:status

# Check recent logs for errors
tail -n 100 logs/edge-agent.err.log

# Check uptime (from logs)
grep "Edge Agent is running" logs/edge-agent.out.log | tail -1
```

### Performance Monitoring

```bash
# CPU and memory usage
ps aux | grep "node.*dist/index.js"

# Log file sizes
du -h logs/edge-agent.*.log
```

## Best Practices

1. **Monitor logs regularly** - Check for errors at least weekly
2. **Keep builds updated** - Run `npm run service:restart` after code changes
3. **Test before deploying** - Use `npm run dev` to test changes before installing service
4. **Backup configuration** - Keep `.env` and `config.yaml` backed up
5. **Review logs after crashes** - Check error logs if service restarts unexpectedly

## Comparison: Service vs Manual

| Feature | LaunchDaemon Service | Manual (edge-agent.sh) |
|---------|---------------------|------------------------|
| Auto-start on boot | ✅ Yes | ❌ No |
| Auto-restart on crash | ✅ Yes | ❌ No |
| Background operation | ✅ Always | ⚠️ Until terminal closes |
| Log persistence | ✅ Separate files | ⚠️ Single file |
| Management | npm scripts | Shell script |
| Best for | Production | Development |

## Next Steps

- [Configuration Guide](CONFIGURATION.md) - Tune performance settings
- [Troubleshooting](TROUBLESHOOTING.md) - Common issues and solutions
- [Performance Guide](../architecture/PERFORMANCE.md) - Optimization tips
