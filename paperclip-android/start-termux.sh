#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PIDFILE="$HOME/.zoz-paperclip.pid"

command -v proot-distro >/dev/null || { echo "Install proot-distro first; see paperclip-android/README.md"; exit 1; }
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
if curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
  echo "Paperclip is already responding at http://127.0.0.1:3100"
  exit 0
fi
mkdir -p "$HOME/.paperclip"
nohup paperclipai run > "$HOME/.paperclip/termux-server.log" 2>&1 < /dev/null &
echo $! > "$HOME/.paperclip/termux-server.pid"
for i in $(seq 1 40); do
  if curl -fsS http://127.0.0.1:3100/api/health >/dev/null 2>&1; then
    echo "Paperclip health check passed at http://127.0.0.1:3100"
    exit 0
  fi
  sleep 2
done
echo "Paperclip did not become healthy. Recent log:"
tail -n 60 "$HOME/.paperclip/termux-server.log" || true
exit 1
'
if command -v termux-wake-lock >/dev/null 2>&1; then
  termux-wake-lock || true
fi
