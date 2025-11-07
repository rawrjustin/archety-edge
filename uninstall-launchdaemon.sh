#!/bin/bash
# Uninstallation script for edge-agent LaunchDaemon

set -e

echo "Uninstalling edge-agent LaunchDaemon..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "This script must be run with sudo"
    exit 1
fi

PLIST_DEST="/Library/LaunchDaemons/com.sage.edge-agent.plist"

# Stop and unload the service
if launchctl list | grep -q "com.sage.edge-agent"; then
    echo "Stopping service..."
    launchctl bootout system/com.sage.edge-agent 2>/dev/null || true
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Remove plist file
if [ -f "$PLIST_DEST" ]; then
    echo "Removing plist file..."
    rm "$PLIST_DEST"
fi

echo ""
echo "✅ Edge Agent LaunchDaemon uninstalled successfully!"
echo ""
