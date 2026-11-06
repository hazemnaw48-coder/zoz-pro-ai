#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
proot-distro login debian --user zoz -- bash -lc '
set -Eeuo pipefail
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24.11.0 >/dev/null
CFG="$HOME/.paperclip/instances/default/config.json"
if [ ! -f "$CFG" ]; then
  echo "Paperclip has not been onboarded. Run: paperclipai onboard"
  exit 2
fi
echo "Starting Paperclip in the foreground. Keep this Termux session open."
echo "Open http://127.0.0.1:3100 in the phone browser."
echo "Press Ctrl+C in this session to stop Paperclip."
exec paperclipai run
'
