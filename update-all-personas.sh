#!/bin/bash
# =============================================================================
# update-all-personas.sh — Pull, build, and restart all edge agent personas
#
# Reads the port registry and sequentially updates each persona:
#   1. git pull --ff-only
#   2. npm install (if package-lock.json changed)
#   3. npm run admin:build
#   4. Rebuild Swift helper (if source changed)
#   5. Restart LaunchDaemon
#   6. Health check verification
#
# Usage:
#   sudo ./update-all-personas.sh
#   sudo ./update-all-personas.sh --force-build   # skip change detection, rebuild all
# =============================================================================

set -e

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "\n${BLUE}${BOLD}==> $1${NC}"; }
log_done()  { echo -e "  ${GREEN}[done]${NC} $1"; }

PORT_REGISTRY="/usr/local/etc/ikiro-edge-ports.json"
FORCE_BUILD=false
HEALTH_WAIT=5

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force-build) FORCE_BUILD=true; shift ;;
    --help|-h)
      echo "Usage: sudo $0 [--force-build]"
      echo ""
      echo "  --force-build   Skip change detection, rebuild everything"
      exit 0
      ;;
    *) log_error "Unknown option: $1"; exit 1 ;;
  esac
done

# --- Check root ---
if [[ "$EUID" -ne 0 ]]; then
  log_error "This script must be run with sudo"
  exit 1
fi

# --- Check port registry ---
if [[ ! -f "$PORT_REGISTRY" ]]; then
  log_error "Port registry not found: ${PORT_REGISTRY}"
  echo "No personas provisioned. Run setup-persona.sh first."
  exit 1
fi

# --- Get persona list ---
PERSONAS=$(python3 -c "
import json
with open('$PORT_REGISTRY') as f:
    registry = json.load(f)
for pid in sorted(registry.keys()):
    info = registry[pid]
    print(f\"{pid}|{info['user']}|{info['health']}\")
")

if [[ -z "$PERSONAS" ]]; then
  echo "No personas in registry."
  exit 0
fi

TOTAL=$(echo "$PERSONAS" | wc -l | tr -d ' ')
echo ""
echo -e "${BOLD}=== Updating ${TOTAL} persona(s) ===${NC}"
echo ""

# Track results
declare -a RESULTS=()
SUCCESS=0
FAILED=0

while IFS='|' read -r PERSONA_ID MAC_USER HEALTH_PORT; do
  PROJECT_DIR="/Users/${MAC_USER}/Code/ikiro-edge"
  PLIST_LABEL="com.ikiro.edge-${PERSONA_ID}"

  log_step "${PERSONA_ID} (${MAC_USER})"

  # --- Verify project exists ---
  if [[ ! -d "${PROJECT_DIR}/.git" ]]; then
    log_error "Repo not found at ${PROJECT_DIR}"
    RESULTS+=("${PERSONA_ID}|FAILED|repo not found")
    ((FAILED++))
    continue
  fi

  # --- Git pull ---
  log_info "Pulling latest code..."
  BEFORE_HEAD=$(sudo -u "$MAC_USER" git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null)
  if ! sudo -u "$MAC_USER" git -C "$PROJECT_DIR" pull --ff-only 2>&1; then
    log_error "Git pull failed (may need manual resolution)"
    RESULTS+=("${PERSONA_ID}|FAILED|git pull failed")
    ((FAILED++))
    continue
  fi
  AFTER_HEAD=$(sudo -u "$MAC_USER" git -C "$PROJECT_DIR" rev-parse HEAD 2>/dev/null)

  if [[ "$BEFORE_HEAD" == "$AFTER_HEAD" && "$FORCE_BUILD" == false ]]; then
    log_info "Already up to date (${AFTER_HEAD:0:7})"
  else
    log_done "Updated to ${AFTER_HEAD:0:7}"
  fi

  # --- npm install (if package-lock.json changed) ---
  NEEDS_NPM=false
  if [[ "$FORCE_BUILD" == true ]]; then
    NEEDS_NPM=true
  elif [[ "$BEFORE_HEAD" != "$AFTER_HEAD" ]]; then
    if sudo -u "$MAC_USER" git -C "$PROJECT_DIR" diff --name-only "${BEFORE_HEAD}" "${AFTER_HEAD}" 2>/dev/null | grep -q "package-lock.json"; then
      NEEDS_NPM=true
    fi
  fi

  if [[ "$NEEDS_NPM" == true ]]; then
    log_info "Running npm install..."
    sudo -u "$MAC_USER" bash -c "cd '$PROJECT_DIR' && npm install --production=false 2>&1" | tail -1
    log_done "Dependencies updated"
  else
    log_info "package-lock.json unchanged, skipping npm install"
  fi

  # --- Build TypeScript + admin portal ---
  log_info "Building TypeScript and admin portal..."
  if ! sudo -u "$MAC_USER" bash -c "cd '$PROJECT_DIR' && npm run admin:build 2>&1" | tail -3; then
    log_error "Build failed"
    RESULTS+=("${PERSONA_ID}|FAILED|build failed")
    ((FAILED++))
    continue
  fi
  log_done "Build complete"

  # --- Rebuild Swift helper (if source changed) ---
  NEEDS_SWIFT=false
  if [[ "$FORCE_BUILD" == true ]]; then
    NEEDS_SWIFT=true
  elif [[ "$BEFORE_HEAD" != "$AFTER_HEAD" ]]; then
    if sudo -u "$MAC_USER" git -C "$PROJECT_DIR" diff --name-only "${BEFORE_HEAD}" "${AFTER_HEAD}" 2>/dev/null | grep -q "native/messages-helper/Sources/"; then
      NEEDS_SWIFT=true
    fi
  fi

  if [[ "$NEEDS_SWIFT" == true ]]; then
    if [[ -d "${PROJECT_DIR}/native/messages-helper" ]]; then
      log_info "Rebuilding Swift helper..."
      sudo -u "$MAC_USER" bash -c "cd '${PROJECT_DIR}/native/messages-helper' && swift build -c release 2>&1" | tail -3
      log_done "Swift helper rebuilt"
    fi
  else
    log_info "Swift sources unchanged, skipping rebuild"
  fi

  # --- Restart LaunchDaemon ---
  log_info "Restarting service..."
  if launchctl list 2>/dev/null | grep -q "$PLIST_LABEL"; then
    launchctl kickstart -k "system/${PLIST_LABEL}" 2>/dev/null || {
      # Fallback for older macOS
      launchctl stop "$PLIST_LABEL" 2>/dev/null || true
      sleep 1
      launchctl start "$PLIST_LABEL" 2>/dev/null || true
    }
  else
    # Not loaded, try to load it
    PLIST_PATH="/Library/LaunchDaemons/${PLIST_LABEL}.plist"
    if [[ -f "$PLIST_PATH" ]]; then
      launchctl load "$PLIST_PATH" 2>/dev/null || true
    else
      log_error "Plist not found: ${PLIST_PATH}"
      RESULTS+=("${PERSONA_ID}|FAILED|plist not found")
      ((FAILED++))
      continue
    fi
  fi

  # --- Health check ---
  log_info "Waiting ${HEALTH_WAIT}s for startup..."
  sleep "$HEALTH_WAIT"

  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 3 "http://localhost:${HEALTH_PORT}/health" 2>/dev/null || echo "000")

  if [[ "$HTTP_CODE" == "200" ]]; then
    log_done "Health check passed (port ${HEALTH_PORT})"
    RESULTS+=("${PERSONA_ID}|OK|${AFTER_HEAD:0:7}")
    ((SUCCESS++))
  else
    log_error "Health check failed (HTTP ${HTTP_CODE} on port ${HEALTH_PORT})"
    RESULTS+=("${PERSONA_ID}|FAILED|health check HTTP ${HTTP_CODE}")
    ((FAILED++))
  fi

done <<< "$PERSONAS"

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BOLD}=== Update Summary ===${NC}"
echo ""
printf "%-10s %-10s %s\n" "Persona" "Status" "Detail"
printf "%-10s %-10s %s\n" "-------" "------" "------"

for result in "${RESULTS[@]}"; do
  IFS='|' read -r persona status detail <<< "$result"
  if [[ "$status" == "OK" ]]; then
    printf "%-10s ${GREEN}%-10s${NC} %s\n" "$persona" "$status" "$detail"
  else
    printf "%-10s ${RED}%-10s${NC} %s\n" "$persona" "$status" "$detail"
  fi
done

echo ""
echo -e "Total: ${GREEN}${SUCCESS} succeeded${NC}, ${RED}${FAILED} failed${NC} (of ${TOTAL})"
echo ""

if [[ "$FAILED" -gt 0 ]]; then
  exit 1
fi
