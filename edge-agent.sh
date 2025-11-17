#!/bin/bash

# Edge Agent Process Manager
# Ensures only one instance runs at a time

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/edge-agent.pid"
LOG_FILE="$SCRIPT_DIR/edge-agent.log"
NODE_BIN="$(which node)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Print colored message
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if process is running
is_running() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            return 0  # Running
        else
            # PID file exists but process is dead
            rm -f "$PID_FILE"
            return 1  # Not running
        fi
    fi
    return 1  # Not running
}

# Get status
status() {
    if is_running; then
        PID=$(cat "$PID_FILE")
        log_info "Edge agent is running (PID: $PID)"

        # Show resource usage
        ps -p "$PID" -o pid,pcpu,pmem,etime,command 2>/dev/null || true

        return 0
    else
        log_warn "Edge agent is not running"
        return 1
    fi
}

# Start the edge agent
start() {
    cd "$SCRIPT_DIR"

    # Check if already running
    if is_running; then
        PID=$(cat "$PID_FILE")
        log_error "Edge agent is already running (PID: $PID)"
        log_info "Use '$0 restart' to restart it"
        exit 1
    fi

    # Kill any orphaned node processes running edge agent
    log_info "Checking for orphaned processes..."
    ORPHANS=$(pgrep -f "node dist/index.js" || true)
    if [ -n "$ORPHANS" ]; then
        log_warn "Found orphaned processes, cleaning up..."
        killall -9 node 2>/dev/null || true
        sleep 1
    fi

    # Load environment variables from .env file
    if [ -f "$SCRIPT_DIR/.env" ]; then
        export $(cat "$SCRIPT_DIR/.env" | grep -v "^#" | xargs)
    fi

    # Start the agent
    log_info "Starting edge agent..."

    # Run in background and capture PID
    nohup npm start > "$LOG_FILE" 2>&1 &
    PID=$!

    # Wait a moment to ensure it started
    sleep 2

    # Verify it's actually running
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "$PID" > "$PID_FILE"
        log_info "✅ Edge agent started successfully (PID: $PID)"
        log_info "View logs: tail -f $LOG_FILE"
    else
        log_error "Failed to start edge agent"
        log_error "Check logs: cat $LOG_FILE"
        exit 1
    fi
}

# Stop the edge agent
stop() {
    if ! is_running; then
        log_warn "Edge agent is not running"

        # Clean up any orphaned processes anyway
        ORPHANS=$(pgrep -f "node dist/index.js" || true)
        if [ -n "$ORPHANS" ]; then
            log_warn "Found orphaned processes, cleaning up..."
            killall -9 node 2>/dev/null || true
        fi

        return 0
    fi

    PID=$(cat "$PID_FILE")
    log_info "Stopping edge agent (PID: $PID)..."

    # Try graceful shutdown first (SIGTERM)
    kill "$PID" 2>/dev/null || true

    # Wait up to 10 seconds for graceful shutdown
    for i in {1..10}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done

    # Force kill if still running
    if ps -p "$PID" > /dev/null 2>&1; then
        log_warn "Graceful shutdown failed, forcing..."
        kill -9 "$PID" 2>/dev/null || true
        sleep 1
    fi

    # Clean up PID file
    rm -f "$PID_FILE"

    # Double check - kill any remaining node processes
    killall -9 node 2>/dev/null || true

    log_info "✅ Edge agent stopped"
}

# Restart the edge agent
restart() {
    log_info "Restarting edge agent..."
    stop
    sleep 2
    start
}

# Show logs
logs() {
    if [ ! -f "$LOG_FILE" ]; then
        log_error "Log file not found: $LOG_FILE"
        exit 1
    fi

    if [ "$1" == "-f" ] || [ "$1" == "--follow" ]; then
        tail -f "$LOG_FILE"
    else
        tail -n 50 "$LOG_FILE"
    fi
}

# Main command handler
case "${1:-}" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    status)
        status
        ;;
    logs)
        logs "$2"
        ;;
    *)
        echo "Edge Agent Process Manager"
        echo ""
        echo "Usage: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Commands:"
        echo "  start     Start the edge agent (ensures only one instance)"
        echo "  stop      Stop the edge agent"
        echo "  restart   Restart the edge agent"
        echo "  status    Check if edge agent is running"
        echo "  logs      Show last 50 lines of logs"
        echo "  logs -f   Follow logs in real-time"
        echo ""
        exit 1
        ;;
esac
