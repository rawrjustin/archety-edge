#!/bin/bash
# =============================================================================
# backup-databases.sh — Back up SQLite databases for all edge agent personas
#
# For each persona in the port registry:
#   - Uses sqlite3 .backup (online-safe, works while agent is running)
#   - Backs up: edge-agent.db, data/edge-state.db, data/rules.db,
#               data/plans.db, data/scheduler.db
#   - Destination: /Users/<user>/Code/archety-edge/backups/<date>/
#   - Rotates: keeps last 7 days
#   - Also backs up the port registry itself
#
# Designed for cron (daily at 3am). Run with sudo.
#
# Usage:
#   sudo ./backup-databases.sh
#   sudo ./backup-databases.sh --install-cron   # install daily cron job
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
log_done()  { echo -e "  ${GREEN}[done]${NC} $1"; }

PORT_REGISTRY="/usr/local/etc/archety-edge-ports.json"
DATE=$(date +%Y-%m-%d)
RETENTION_DAYS=7
INSTALL_CRON=false

# Databases to back up (relative to project dir)
DB_FILES=("edge-agent.db" "data/edge-state.db" "data/rules.db" "data/plans.db" "data/scheduler.db")

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --install-cron) INSTALL_CRON=true; shift ;;
    --help|-h)
      echo "Usage: sudo $0 [--install-cron]"
      echo ""
      echo "  --install-cron   Install a daily cron job (runs at 3am)"
      exit 0
      ;;
    *) log_error "Unknown option: $1"; exit 1 ;;
  esac
done

if [[ "$EUID" -ne 0 ]]; then
  log_error "This script must be run with sudo"
  exit 1
fi

# --- Install cron mode ---
if [[ "$INSTALL_CRON" == true ]]; then
  SCRIPT_PATH="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
  CRON_LINE="0 3 * * * ${SCRIPT_PATH} >> /var/log/archety-backup.log 2>&1"

  # Check if already installed
  if crontab -l 2>/dev/null | grep -qF "backup-databases.sh"; then
    log_warn "Cron job already installed:"
    crontab -l 2>/dev/null | grep "backup-databases"
  else
    (crontab -l 2>/dev/null; echo "$CRON_LINE") | crontab -
    log_done "Cron job installed: daily at 3am"
    echo "  ${CRON_LINE}"
  fi
  exit 0
fi

# --- Check port registry ---
if [[ ! -f "$PORT_REGISTRY" ]]; then
  log_error "Port registry not found: ${PORT_REGISTRY}"
  exit 1
fi

echo ""
echo -e "${BOLD}=== Database Backup (${DATE}) ===${NC}"
echo ""

TOTAL_BACKED=0
TOTAL_SKIPPED=0

# --- Back up port registry ---
REGISTRY_BACKUP_DIR="/usr/local/etc/archety-backups"
mkdir -p "$REGISTRY_BACKUP_DIR"
cp "$PORT_REGISTRY" "${REGISTRY_BACKUP_DIR}/archety-edge-ports-${DATE}.json"
log_done "Port registry backed up"

# Rotate registry backups
find "$REGISTRY_BACKUP_DIR" -name "archety-edge-ports-*.json" -mtime +${RETENTION_DAYS} -delete 2>/dev/null || true

# --- Back up each persona's databases ---
PERSONAS=$(python3 -c "
import json
with open('$PORT_REGISTRY') as f:
    registry = json.load(f)
for pid in sorted(registry.keys()):
    info = registry[pid]
    print(f\"{pid}|{info['user']}\")
")

while IFS='|' read -r PERSONA_ID MAC_USER; do
  PROJECT_DIR="/Users/${MAC_USER}/Code/archety-edge"
  BACKUP_DIR="${PROJECT_DIR}/backups/${DATE}"

  log_info "Backing up ${PERSONA_ID} (${MAC_USER})..."

  if [[ ! -d "$PROJECT_DIR" ]]; then
    log_warn "Project dir not found: ${PROJECT_DIR}, skipping"
    continue
  fi

  # Create backup directory
  sudo -u "$MAC_USER" mkdir -p "$BACKUP_DIR"

  for db_rel in "${DB_FILES[@]}"; do
    db_path="${PROJECT_DIR}/${db_rel}"
    db_name=$(basename "$db_rel")

    if [[ -f "$db_path" ]]; then
      backup_path="${BACKUP_DIR}/${db_name}"
      # sqlite3 .backup is online-safe (doesn't lock the source)
      if sqlite3 "$db_path" ".backup '${backup_path}'" 2>/dev/null; then
        chown "$MAC_USER:staff" "$backup_path"
        ((TOTAL_BACKED++))
      else
        log_warn "Failed to back up ${db_rel} for ${PERSONA_ID}"
      fi
    else
      ((TOTAL_SKIPPED++))
    fi
  done

  log_done "${PERSONA_ID}: backed up to ${BACKUP_DIR}"

  # --- Rotate old backups (keep last N days) ---
  if [[ -d "${PROJECT_DIR}/backups" ]]; then
    find "${PROJECT_DIR}/backups" -maxdepth 1 -type d -name "20*" -mtime +${RETENTION_DAYS} -exec rm -rf {} \; 2>/dev/null || true
  fi

done <<< "$PERSONAS"

echo ""
echo -e "${BOLD}=== Backup Complete ===${NC}"
echo ""
echo "  Databases backed up: ${TOTAL_BACKED}"
echo "  Databases not found: ${TOTAL_SKIPPED} (normal for unused features)"
echo "  Retention:           ${RETENTION_DAYS} days"
echo ""
