#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
proot-distro login debian --user zoz -- bash -lc '
PIDFILE="$HOME/.paperclip/termux-server.pid"
if [ -f "$PIDFILE" ]; then
  PID="$(cat "$PIDFILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill -TERM "$PID"
    echo "Sent graceful stop to Paperclip PID $PID"
  else
    echo "Saved PID is not running."
  fi
  rm -f "$PIDFILE"
else
  echo "No Paperclip PID file found."
fi
'
if command -v termux-wake-unlock >/dev/null 2>&1; then termux-wake-unlock || true; fi
