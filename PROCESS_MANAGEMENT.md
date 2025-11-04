# Edge Agent Process Management

## ✅ Single Instance Guarantee

The `edge-agent.sh` script ensures **only one instance** of the edge agent runs at a time, preventing duplicate message processing.

## 📋 Commands

### Start the Edge Agent
```bash
./edge-agent.sh start
```
- Checks for existing instances
- Cleans up any orphaned processes
- Starts fresh with PID file tracking
- **Prevents duplicates** - will error if already running

### Stop the Edge Agent
```bash
./edge-agent.sh stop
```
- Graceful shutdown (SIGTERM) with 10-second timeout
- Force kills if needed
- Cleans up PID file and orphaned processes

### Restart the Edge Agent
```bash
./edge-agent.sh restart
```
- Stops and starts cleanly
- **Use this instead of starting multiple times**

### Check Status
```bash
./edge-agent.sh status
```
Shows:
- Running status
- PID
- CPU and memory usage
- Uptime

### View Logs
```bash
# Last 50 lines
./edge-agent.sh logs

# Follow in real-time
./edge-agent.sh logs -f
```

## 🔄 Common Workflows

### Daily Operation
```bash
# Check if running
./edge-agent.sh status

# View recent activity
./edge-agent.sh logs
```

### After Code Changes
```bash
# Rebuild and restart
npm run build
./edge-agent.sh restart
```

### Troubleshooting
```bash
# Stop everything
./edge-agent.sh stop

# Check for any stragglers
ps aux | grep "node dist/index.js"

# Start fresh
./edge-agent.sh start
```

## 🔒 How It Prevents Duplicates

1. **PID File Tracking**: Stores process ID in `edge-agent.pid`
2. **Process Verification**: Checks if PID is actually running
3. **Orphan Cleanup**: Kills any leftover processes before starting
4. **Start Guard**: Refuses to start if already running

## 📁 Files Created

- `edge-agent.pid` - Current process ID
- `edge-agent.log` - All stdout/stderr output

## 🚀 Auto-Start on Boot

To run automatically:

```bash
# Edit the LaunchAgent plist to use the script
# Then load it
cp com.archety.edge-agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.archety.edge-agent.plist
```

## ⚠️ Important

**Never run `npm start` directly anymore!**

Always use:
```bash
./edge-agent.sh start
```

This ensures proper process management and prevents duplicates.

## 🔍 Debug Commands

```bash
# Check for multiple instances
ps aux | grep "node dist/index.js" | grep -v grep

# Should show only 1 (or 0 if not running)
ps aux | grep "node dist/index.js" | grep -v grep | wc -l

# Kill all node processes (emergency)
killall -9 node
```

## 💡 Tips

- **Use `restart` not `stop` + `start`** - It's safer
- **Check status first** - Before starting or stopping
- **Use `logs -f`** - To watch real-time activity
- **Auto-start recommended** - Ensures it's always running

## 🎯 Example Session

```bash
# Morning check
$ ./edge-agent.sh status
[INFO] Edge agent is running (PID: 6423)

# Deploy update
$ git pull
$ npm run build
$ ./edge-agent.sh restart
[INFO] Restarting edge agent...
[INFO] Stopping edge agent (PID: 6423)...
[INFO] ✅ Edge agent stopped
[INFO] Starting edge agent...
[INFO] ✅ Edge agent started successfully (PID: 6891)

# Watch it work
$ ./edge-agent.sh logs -f
[INFO] 📬 Processing 1 new message(s)
[INFO] ✅ Response sent successfully
```
