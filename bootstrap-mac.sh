#!/bin/bash
# =============================================================================
# bootstrap-mac.sh — Prepare a fresh Mac mini for multi-persona edge agents
#
# Installs all prerequisites before setup-persona.sh can run.
# Idempotent — safe to re-run. Skips already-installed components.
#
# Usage:
#   sudo ./bootstrap-mac.sh
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
log_skip()  { echo -e "  ${YELLOW}[skip]${NC} $1 (already configured)"; }

# --- Check root ---
if [[ "$EUID" -ne 0 ]]; then
  log_error "This script must be run with sudo"
  exit 1
fi

REAL_USER="${SUDO_USER:-$USER}"

echo ""
echo -e "${BOLD}=== Mac Mini Bootstrap for Ikiro Edge Agents ===${NC}"
echo ""

# =============================================================================
# 1. Xcode Command Line Tools
# =============================================================================
log_step "Xcode Command Line Tools"

if xcode-select -p &>/dev/null; then
  log_skip "Xcode CLT already installed at $(xcode-select -p)"
else
  log_info "Installing Xcode Command Line Tools..."
  xcode-select --install 2>&1 || true
  echo ""
  log_warn "A dialog may have appeared. Accept the license and wait for install to complete."
  log_warn "After install finishes, re-run this script."
  exit 0
fi

# =============================================================================
# 2. Homebrew
# =============================================================================
log_step "Homebrew"

if sudo -u "$REAL_USER" command -v brew &>/dev/null; then
  log_skip "Homebrew already installed"
else
  log_info "Installing Homebrew..."
  sudo -u "$REAL_USER" /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  log_done "Homebrew installed"
fi

# =============================================================================
# 3. Node.js
# =============================================================================
log_step "Node.js"

if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version)
  log_skip "Node.js ${NODE_VERSION} already installed"
else
  log_info "Installing Node.js via Homebrew..."
  sudo -u "$REAL_USER" brew install node
  log_done "Node.js $(node --version) installed"
fi

# =============================================================================
# 4. Git (comes with Xcode CLT)
# =============================================================================
log_step "Git"

if command -v git &>/dev/null; then
  GIT_VERSION=$(git --version)
  log_skip "${GIT_VERSION} available"
else
  log_error "Git not found. Xcode CLT should provide it. Check Xcode install."
  exit 1
fi

# =============================================================================
# 5. Enable SSH (Remote Login)
# =============================================================================
log_step "SSH (Remote Login)"

if systemsetup -getremotelogin 2>/dev/null | grep -qi "on"; then
  log_skip "SSH already enabled"
else
  log_info "Enabling SSH..."
  systemsetup -setremotelogin on 2>/dev/null || true
  log_done "SSH enabled"
fi

# =============================================================================
# 6. Enable Screen Sharing (Remote Management)
# =============================================================================
log_step "Screen Sharing (Remote Management)"

ARD_KICKSTART="/System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart"

if [[ -f "$ARD_KICKSTART" ]]; then
  log_info "Enabling Screen Sharing for all users..."
  "$ARD_KICKSTART" -activate -configure -allowAccessFor -allUsers -privs -all -quiet 2>/dev/null || true
  log_done "Screen Sharing enabled"
else
  log_warn "ARD kickstart not found — enable Screen Sharing manually in System Settings"
fi

# =============================================================================
# 7. Disable Sleep
# =============================================================================
log_step "Power Management (disable sleep)"

CURRENT_SLEEP=$(pmset -g | grep "^[ ]*sleep" | awk '{print $2}' 2>/dev/null || echo "unknown")
if [[ "$CURRENT_SLEEP" == "0" ]]; then
  log_skip "System sleep already disabled"
else
  log_info "Disabling system sleep and display sleep..."
  pmset -a sleep 0 displaysleep 0
  log_done "Sleep disabled (sleep=0, displaysleep=0)"
fi

# =============================================================================
# 8. Disable Auto-Logout
# =============================================================================
log_step "Auto-Logout"

CURRENT_AUTOLOGOUT=$(defaults read /Library/Preferences/.GlobalPreferences com.apple.autologout.AutoLogOutDelay 2>/dev/null || echo "not_set")
if [[ "$CURRENT_AUTOLOGOUT" == "0" ]]; then
  log_skip "Auto-logout already disabled"
else
  defaults write /Library/Preferences/.GlobalPreferences com.apple.autologout.AutoLogOutDelay -int 0
  log_done "Auto-logout disabled"
fi

# =============================================================================
# 9. Enable Fast User Switching
# =============================================================================
log_step "Fast User Switching"

CURRENT_FUS=$(defaults read /Library/Preferences/.GlobalPreferences MultipleSessionEnabled 2>/dev/null || echo "0")
if [[ "$CURRENT_FUS" == "1" ]]; then
  log_skip "Fast User Switching already enabled"
else
  defaults write /Library/Preferences/.GlobalPreferences MultipleSessionEnabled -bool true
  log_done "Fast User Switching enabled"
fi

# =============================================================================
# 10. Disable App Nap
# =============================================================================
log_step "App Nap"

CURRENT_APPNAP=$(sudo -u "$REAL_USER" defaults read NSGlobalDomain NSAppSleepDisabled 2>/dev/null || echo "0")
if [[ "$CURRENT_APPNAP" == "1" ]]; then
  log_skip "App Nap already disabled"
else
  sudo -u "$REAL_USER" defaults write NSGlobalDomain NSAppSleepDisabled -bool YES
  log_done "App Nap disabled for user ${REAL_USER}"
fi

# =============================================================================
# 11. Disable Auto-Login (required for multi-user)
# =============================================================================
log_step "Auto-Login"

if defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser &>/dev/null; then
  defaults delete /Library/Preferences/com.apple.loginwindow autoLoginUser
  log_done "Auto-login disabled (required for multi-user sessions)"
else
  log_skip "Auto-login already disabled"
fi

# =============================================================================
# 12. Create port registry directory
# =============================================================================
log_step "Port Registry Directory"

if [[ -d "/usr/local/etc" ]]; then
  log_skip "/usr/local/etc already exists"
else
  mkdir -p /usr/local/etc
  log_done "Created /usr/local/etc"
fi

# =============================================================================
# Summary
# =============================================================================
echo ""
echo -e "${BOLD}=== Bootstrap Complete ===${NC}"
echo ""
echo "  Xcode CLT:           $(xcode-select -p 2>/dev/null || echo 'NOT INSTALLED')"
echo "  Homebrew:             $(sudo -u "$REAL_USER" brew --version 2>/dev/null | head -1 || echo 'NOT INSTALLED')"
echo "  Node.js:              $(node --version 2>/dev/null || echo 'NOT INSTALLED')"
echo "  Git:                  $(git --version 2>/dev/null || echo 'NOT INSTALLED')"
echo "  SSH:                  $(systemsetup -getremotelogin 2>/dev/null | awk '{print $NF}')"
echo "  Sleep disabled:       $(pmset -g | grep '^ sleep' | awk '{print ($2==0) ? "yes" : "no"}')"
echo "  Auto-logout:          disabled"
echo "  Fast User Switching:  enabled"
echo "  App Nap:              disabled"
echo ""
echo -e "${GREEN}${BOLD}Ready to provision personas with setup-persona.sh${NC}"
echo ""
echo "  Next steps:"
echo "    sudo ./setup-persona.sh --persona-id luna --phone '+1...' --edge-secret '...'"
echo ""
