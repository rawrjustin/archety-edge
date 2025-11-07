#!/bin/bash
# Installation script for edge-agent LaunchDaemon

set -e

echo "Installing edge-agent LaunchDaemon..."

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "This script must be run with sudo"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$SCRIPT_DIR"

# Get the user who invoked sudo (or current user if not using sudo)
REAL_USER="${SUDO_USER:-$USER}"

echo "Project directory: $PROJECT_DIR"
echo "Running as user: $REAL_USER"

# Ensure the project is built
if [ ! -f "$PROJECT_DIR/dist/index.js" ]; then
    echo "Error: Project not built. Run 'npm run build' first."
    exit 1
fi

# Create logs directory if it doesn't exist
mkdir -p "$PROJECT_DIR/logs"
chown "$REAL_USER:staff" "$PROJECT_DIR/logs"

# Stop the service if it's already running
if launchctl list | grep -q "com.sage.edge-agent"; then
    echo "Stopping existing service..."
    launchctl bootout system/com.sage.edge-agent 2>/dev/null || true
    launchctl unload /Library/LaunchDaemons/com.sage.edge-agent.plist 2>/dev/null || true
fi

# Generate plist file with dynamic paths
echo "Generating plist file with dynamic paths..."
PLIST_DEST="/Library/LaunchDaemons/com.sage.edge-agent.plist"

# Find node executable
NODE_PATH=$(which node)
if [ -z "$NODE_PATH" ]; then
    echo "Error: node not found in PATH. Please install Node.js first."
    exit 1
fi

echo "Using node at: $NODE_PATH"

# Create plist file
cat > "$PLIST_DEST" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.sage.edge-agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_PATH</string>
        <string>$PROJECT_DIR/dist/index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$PROJECT_DIR/logs/edge-agent.out.log</string>
    <key>StandardErrorPath</key>
    <string>$PROJECT_DIR/logs/edge-agent.err.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>NODE_ENV</key>
        <string>production</string>
    </dict>
</dict>
</plist>
EOF

chown root:wheel "$PLIST_DEST"
chmod 644 "$PLIST_DEST"

# Load and start the service
echo "Loading and starting service..."
launchctl load "$PLIST_DEST"

echo ""
echo "✅ Edge Agent LaunchDaemon installed successfully!"
echo ""
echo "The service will now start automatically on boot."
echo ""
echo "Useful commands:"
echo "  - Check status: sudo launchctl list | grep edge-agent"
echo "  - View logs: tail -f $PROJECT_DIR/logs/edge-agent.out.log"
echo "  - Stop service: sudo launchctl unload $PLIST_DEST"
echo "  - Start service: sudo launchctl load $PLIST_DEST"
echo ""
