#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
proot-distro login debian --user zoz -- bash -lc '
if curl -fsS http://127.0.0.1:3100/api/health; then
  echo
  echo "Paperclip health endpoint responded."
else
  echo "Paperclip is not responding at 127.0.0.1:3100"
  if [ -f "$HOME/.paperclip/termux-server.log" ]; then tail -n 40 "$HOME/.paperclip/termux-server.log"; fi
  exit 1
fi
'
