# Troubleshooting Guide

Common issues and solutions for the edge relay.

## Permission Issues

### Cannot Read Messages Database

**Symptom:**
```
Error: Failed to poll messages: SQLITE_CANTOPEN
```

**Solution:**
Grant Full Disk Access to Terminal:

1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
2. Add **Terminal.app** (or iTerm)
3. Restart Terminal
4. Restart edge agent: `./edge-agent.sh restart`

**Verify:**
```bash
sqlite3 ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message LIMIT 1"
# Should show a number, not an error
```

---

### AppleScript Permission Denied

**Symptom:**
```
❌ Failed to send message: not authorized to send Apple events
```

**Solution:**
Grant Automation permission:

1. Open **System Settings** → **Privacy & Security** → **Automation**
2. Enable **Terminal** → **Messages**
3. Restart edge agent

**Verify:**
```bash
osascript -e 'tell application "Messages" to return count of accounts'
# Should return a number (usually 1 or 2)
```

---

## Backend Connection Issues

### 401 Unauthorized

**Symptom:**
```
Backend returns 401 Unauthorized
```

**Solution:**
Check your credentials match the backend:

```bash
# Verify .env file
cat .env | grep EDGE_SECRET
# Should match backend configuration

# Re-register
rm ./data/edge-agent.db
./edge-agent.sh restart
```

---

### Connection Timeout

**Symptom:**
```
Error: timeout of 10000ms exceeded
```

**Solution:**
Backend might be slow or down:

```bash
# Check backend health
curl https://archety-backend.onrender.com/health

# Increase timeout (config.yaml)
backend:
  request_timeout_ms: 30000  # 30 seconds

# Restart
./edge-agent.sh restart
```

---

## Message Processing Issues

### Messages Not Being Detected

**Symptom:**
No new messages appearing in logs despite sending iMessages

**Checklist:**
1. ✅ Messages.app is running and signed in
2. ✅ Full Disk Access granted to Terminal
3. ✅ Messages are actually in your Messages.app
4. ✅ Edge agent is running: `./edge-agent.sh status`

**Debug:**
```bash
# Check if messages exist in database
sqlite3 ~/Library/Messages/chat.db \
  "SELECT COUNT(*) FROM message WHERE is_from_me = 0 ORDER BY ROWID DESC LIMIT 10"

# Check edge agent logs
./edge-agent.sh logs | grep "Processing"

# Enable debug logging (config.yaml)
logging:
  level: "debug"

# Restart and watch
./edge-agent.sh restart
./edge-agent.sh logs -f
```

---

### Messages Detected But Not Forwarded

**Symptom:**
Logs show "Processing message" but no backend call or response

**Debug:**
```bash
# Check logs for backend errors
./edge-agent.sh logs | grep -i error

# Verify backend URL
cat config.yaml | grep url

# Test backend manually
curl https://archety-backend.onrender.com/health

# Check network connectivity
ping archety-backend.onrender.com
```

---

### Response Not Sending via iMessage

**Symptom:**
Backend responds but message not sent to iMessage

**Checklist:**
1. ✅ Automation permission granted
2. ✅ Messages.app is running
3. ✅ Logged into iMessage account

**Debug:**
```bash
# Test AppleScript manually
osascript -e 'tell application "Messages"
  set targetService to 1st account whose service type = iMessage
  set targetBuddy to participant "+1234567890" of targetService
  send "Test message" to targetBuddy
end tell'

# Check edge agent logs for send errors
./edge-agent.sh logs | grep "Failed to send"
```

---

## Performance Issues

### High CPU Usage

**Symptom:**
Edge agent using > 20% CPU constantly

**Solutions:**

1. **Check for message flood:**
   ```bash
   ./edge-agent.sh logs | grep "Processing" | tail -20
   # If processing many messages, that's expected
   ```

2. **Switch to low-resource profile:**
   ```yaml
   # config.yaml
   performance:
     profile: "low-resource"
   ```

3. **Disable debug logging:**
   ```yaml
   # config.yaml
   logging:
     level: "info"  # or "warn"
   ```

4. **Check for stuck processes:**
   ```bash
   ps aux | grep -i messages
   ps aux | grep -i osascript
   # Kill any stuck processes
   ```

---

### Slow Message Responses

**Symptom:**
Messages take > 5 seconds to get responses

**Debug:**
```bash
# Check which stage is slow
./edge-agent.sh logs -f

# Look for timing in logs:
# 1. Message detection: Should be < 2s
# 2. Backend processing: Should be < 1s
# 3. Message sending: Should be < 500ms (batched) or < 2s (sequential)
```

**Solutions:**

1. **Use low-latency profile:**
   ```yaml
   performance:
     profile: "low-latency"
   ```

2. **Enable batch sends (should be default):**
   ```yaml
   performance:
     batch_applescript_sends: true
   ```

3. **Check backend latency:**
   ```bash
   curl -w "@curl-format.txt" https://archety-backend.onrender.com/health
   ```

---

## Process Management Issues

### Edge Agent Won't Start

**Symptom:**
```bash
./edge-agent.sh start
# Shows error or "Already running" when it's not
```

**Solution:**
```bash
# Check for stale PID file
cat edge-agent.pid
ps -p $(cat edge-agent.pid)  # Check if process actually exists

# If not running, remove stale PID
rm edge-agent.pid

# Kill any orphaned processes
pkill -f "edge-agent"
pkill -f "node.*edge-relay"

# Try starting again
./edge-agent.sh start
```

---

### Edge Agent Won't Stop

**Symptom:**
```bash
./edge-agent.sh stop
# Process still running
```

**Solution:**
```bash
# Force kill
./edge-agent.sh stop
pkill -9 -f "edge-agent"

# Clean up
rm edge-agent.pid

# Verify it's stopped
ps aux | grep edge-relay
```

---

## Database Issues

### SQLite Database Locked

**Symptom:**
```
Error: SQLITE_BUSY: database is locked
```

**Solution:**
```bash
# Check if multiple instances are running
ps aux | grep edge-relay

# Stop all instances
./edge-agent.sh stop
pkill -f edge-relay

# Remove lock files
rm ./data/*.db-wal
rm ./data/*.db-shm

# Restart
./edge-agent.sh start
```

---

### Corrupted Scheduler Database

**Symptom:**
```
Error: database disk image is malformed
```

**Solution:**
```bash
# Backup and recreate
mv ./data/scheduler.db ./data/scheduler.db.backup
./edge-agent.sh restart

# Database will be recreated automatically
```

---

## System Issues

### macOS Keychain Prompts

**Symptom:**
Constant keychain password prompts

**Solution:**
This shouldn't happen with current implementation. If it does:

```bash
# Check git credential storage
git config --global credential.helper

# Should be "osxkeychain" or empty
# If problematic, disable:
git config --global --unset credential.helper
```

---

### Messages.app Crashing

**Symptom:**
Messages.app crashes when edge agent runs

**Solution:**
```bash
# Stop edge agent
./edge-agent.sh stop

# Reset Messages.app
killall Messages
rm -rf ~/Library/Caches/com.apple.Messages
rm -rf ~/Library/Caches/com.apple.imfoundation.IMRemoteURLConnectionAgent

# Restart Messages.app and re-login

# Reduce AppleScript frequency
# config.yaml
imessage:
  poll_interval_seconds: 5  # Slower polling

# Restart edge agent
./edge-agent.sh start
```

---

## Getting Help

If you're still stuck:

1. **Check logs in detail:**
   ```bash
   ./edge-agent.sh logs | grep -i error
   ./edge-agent.sh logs | grep -i fail
   ```

2. **Verify configuration:**
   ```bash
   cat config.yaml
   cat .env | grep -v '#'
   ```

3. **Test components individually:**
   ```bash
   # Test Messages DB access
   sqlite3 ~/Library/Messages/chat.db "SELECT COUNT(*) FROM message"

   # Test AppleScript
   osascript -e 'tell application "Messages" to return count of accounts'

   # Test backend
   curl https://archety-backend.onrender.com/health
   ```

4. **Collect debug info:**
   ```bash
   # System info
   sw_vers
   node --version

   # Edge agent status
   ./edge-agent.sh status

   # Recent logs (last 100 lines)
   ./edge-agent.sh logs | tail -100
   ```

## See Also

- [Getting Started](./GETTING_STARTED.md) - Initial setup
- [Configuration Guide](./CONFIGURATION.md) - Tuning performance
- [Architecture Overview](../architecture/OVERVIEW.md) - Understanding how it works
