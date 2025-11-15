#!/bin/bash
# Quick status check for edge agent

echo "Edge Agent Status"
echo "================="
echo ""

# Check for running instances
PROCESSES=$(ps aux | grep -E "edge-relay.*index.js" | grep -v grep || true)
INSTANCE_COUNT=$(echo "$PROCESSES" | wc -l | xargs)

if [ -z "$PROCESSES" ]; then
    echo "Status: ❌ NOT RUNNING"
    echo ""
    echo "To start:"
    echo "  sudo launchctl kickstart system/com.sage.edge-agent"
    exit 1
fi

if [ "$INSTANCE_COUNT" -eq 1 ]; then
    ROOT_COUNT=$(echo "$PROCESSES" | grep -c "^root" || true)
    if [ "$ROOT_COUNT" -eq 1 ]; then
        echo "Status: ✅ RUNNING (LaunchDaemon)"
        PID=$(echo "$PROCESSES" | awk '{print $2}')
        echo "PID: $PID"
    else
        echo "Status: ⚠️  RUNNING (Manual - not LaunchDaemon)"
        PID=$(echo "$PROCESSES" | awk '{print $2}')
        echo "PID: $PID"
    fi
else
    echo "Status: ⚠️  MULTIPLE INSTANCES ($INSTANCE_COUNT)"
    echo ""
    echo "⚠️  WARNING: Duplicate instances detected!"
    echo "This causes duplicate messages to be sent to backend."
    echo ""
    echo "Run this to clean up:"
    echo "  ./check-duplicates.sh"
    echo ""
    echo "Running instances:"
    echo "$PROCESSES"
fi

echo ""
echo "Recent logs:"
echo "------------"
tail -5 /Users/sage1/Code/edge-relay/logs/edge-agent.out.log 2>/dev/null || echo "No logs found"
