#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
proot-distro login debian --user zoz -- bash -lc '
set -Eeuo pipefail
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24.11.0 >/dev/null
PKG="$HOME/zoz-pro-ai/paperclip-company"
if [ ! -f "$PKG/COMPANY.md" ] || [ ! -f "$PKG/.paperclip.yaml" ]; then
  echo "Company package missing at $PKG"
  exit 1
fi
if ! curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
  echo "Start Paperclip first with paperclipai run."
  exit 1
fi
echo "=== DRY RUN: no company records will be changed ==="
paperclipai company import "$PKG" --target new --new-company-name "ZOZ Pro" --dry-run
echo
read -r -p "If the preview is correct, type IMPORT ZOZ PRO to create a NEW local company: " ANSWER
if [ "$ANSWER" != "IMPORT ZOZ PRO" ]; then
  echo "Cancelled. No import applied."
  exit 0
fi
paperclipai company import "$PKG" --target new --new-company-name "ZOZ Pro"
echo
echo "Import command completed. Verify the company and keep all agent heartbeats disabled."
'
