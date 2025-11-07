#!/bin/bash
# Installation script for edge-agent LaunchDaemon

set -e

echo "Installing edge-agent LaunchDaemon..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "This script must be run with sudo"
    exit 1
fi

# Ensure the project is built
if [ ! -f "/Users/sage1/Code/edge-relay/dist/index.js" ]; then
    echo "Error: Project not built. Run 'npm run build' first."
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p /Users/sage1/Code/edge-relay/logs
chown sage1:staff /Users/sage1/Code/edge-relay/logs

# Stop the service if it's already running
if launchctl list | grep -q "com.sage.edge-agent"; then
    echo "Stopping existing service..."
    launchctl bootout system/com.sage.edge-agent 2>/dev/null || true
    launchctl unload /Library/LaunchDaemons/com.sage.edge-agent.plist 2>/dev/null || true
fi

# Copy plist file to LaunchDaemons
echo "Installing plist file..."
cp /Users/sage1/Code/edge-relay/com.sage.edge-agent.plist /Library/LaunchDaemons/
chown root:wheel /Library/LaunchDaemons/com.sage.edge-agent.plist
chmod 644 /Library/LaunchDaemons/com.sage.edge-agent.plist

# Load and start the service
echo "Loading and starting service..."
launchctl load /Library/LaunchDaemons/com.sage.edge-agent.plist

echo ""
echo "✅ Edge Agent LaunchDaemon installed successfully!"
echo ""
echo "The service will now start automatically on boot."
echo ""
echo "Useful commands:"
echo "  - Check status: sudo launchctl list | grep edge-agent"
echo "  - View logs: tail -f /Users/sage1/Code/edge-relay/logs/edge-agent.out.log"
echo "  - Stop service: sudo launchctl unload /Library/LaunchDaemons/com.sage.edge-agent.plist"
echo "  - Start service: sudo launchctl load /Library/LaunchDaemons/com.sage.edge-agent.plist"
echo ""
