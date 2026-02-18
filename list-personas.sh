#!/bin/bash
# =============================================================================
# list-personas.sh — Show all provisioned edge agent personas and their status
# =============================================================================

PORT_REGISTRY="/usr/local/etc/archety-edge-ports.json"

BOLD='\033[1m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [[ ! -f "$PORT_REGISTRY" ]]; then
  echo "No personas provisioned yet."
  echo "Run: sudo ./setup-persona.sh --help"
  exit 0
fi

# Check if registry is empty
ENTRY_COUNT=$(python3 -c "
import json
with open('$PORT_REGISTRY') as f:
    print(len(json.load(f)))
")

if [[ "$ENTRY_COUNT" == "0" ]]; then
  echo "No personas provisioned yet."
  exit 0
fi

# Print header
printf "\n${BOLD}%-10s %-8s %-8s %-8s %-18s %-12s${NC}\n" \
  "Persona" "User" "Health" "Admin" "Phone" "Status"
printf "%-10s %-8s %-8s %-8s %-18s %-12s\n" \
  "-------" "------" "------" "------" "----------------" "----------"

# Print each persona
python3 -c "
import json
with open('$PORT_REGISTRY') as f:
    registry = json.load(f)
for pid in sorted(registry.keys()):
    info = registry[pid]
    print(f\"{pid}|{info['user']}|{info['health']}|{info['admin']}|{info['phone']}\")
" | while IFS='|' read -r persona user health admin phone; do
  # Check health endpoint
  HTTP_CODE=$(curl -s -o /dev/null -w '%{http_code}' --connect-timeout 2 "http://localhost:${health}/health" 2>/dev/null || echo "000")

  if [[ "$HTTP_CODE" == "200" ]]; then
    STATUS="${GREEN}running${NC}"
  else
    # Check if LaunchDaemon is loaded
    if sudo launchctl list 2>/dev/null | grep -q "com.archety.edge-${persona}"; then
      STATUS="${YELLOW}loaded${NC}"
    else
      STATUS="${RED}stopped${NC}"
    fi
  fi

  printf "%-10s %-8s %-8s %-8s %-18s " "$persona" "$user" "$health" "$admin" "$phone"
  echo -e "$STATUS"
done

echo ""
