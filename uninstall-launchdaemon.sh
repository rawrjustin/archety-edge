#!/bin/bash
# Uninstallation script for edge-agent LaunchDaemon

set -e

echo "Uninstalling edge-agent LaunchDaemon..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "This script must be run with sudo"
    exit 1
fi

# Stop and unload the service
if launchctl list | grep -q "com.sage.edge-agent"; then
    echo "Stopping service..."
    launchctl bootout system/com.sage.edge-agent 2>/dev/null || true
    launchctl unload /Library/LaunchDaemons/com.sage.edge-agent.plist 2>/dev/null || true
fi

# Remove plist file
if [ -f "/Library/LaunchDaemons/com.sage.edge-agent.plist" ]; then
    echo "Removing plist file..."
    rm /Library/LaunchDaemons/com.sage.edge-agent.plist
fi

echo ""
echo "✅ Edge Agent LaunchDaemon uninstalled successfully!"
echo ""
