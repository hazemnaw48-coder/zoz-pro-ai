#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail
proot-distro login debian --user zoz -- bash -lc '
set -Eeuo pipefail
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use 24.11.0 >/dev/null
mkdir -p "$HOME/paperclip-backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
paperclipai db:backup --dir "$HOME/paperclip-backups" --filename-prefix "zoz-paperclip-$STAMP"
INSTANCE="$HOME/.paperclip/instances/default"
if [ -f "$INSTANCE/secrets/master.key" ]; then
  install -m 600 "$INSTANCE/secrets/master.key" "$HOME/paperclip-backups/zoz-paperclip-master-key-$STAMP"
  echo "WARNING: protect the master-key copy separately; it decrypts stored credentials."
else
  echo "Master key file not found at the expected path; verify the Paperclip instance layout."
fi
echo "Backup folder: $HOME/paperclip-backups"
'
