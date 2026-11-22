#!/data/data/com.termux/files/usr/bin/bash
set -Eeuo pipefail

if [ -z "${PREFIX:-}" ] || [ ! -d "$PREFIX" ]; then
  echo "Run this script inside the Termux app, not in a normal Linux shell."
  exit 1
fi

pkg update -y
pkg install -y git curl proot-distro
if ! proot-distro login debian -- true >/dev/null 2>&1; then
  proot-distro install debian
fi

proot-distro login debian -- bash -lc '
set -Eeuo pipefail
apt-get update
apt-get install -y git curl ca-certificates sudo passwd procps psmisc
id zoz >/dev/null 2>&1 || useradd -m -s /bin/bash zoz
usermod -aG sudo zoz
if [ ! -d /home/zoz/zoz-pro-ai/.git ]; then
  git clone --branch docs/paperclip-zoz-orchestration --single-branch https://github.com/hazemnaw48-coder/zoz-pro-ai.git /home/zoz/zoz-pro-ai
else
  git -C /home/zoz/zoz-pro-ai fetch origin docs/paperclip-zoz-orchestration
  git -C /home/zoz/zoz-pro-ai checkout docs/paperclip-zoz-orchestration
  git -C /home/zoz/zoz-pro-ai pull --ff-only origin docs/paperclip-zoz-orchestration
fi
chown -R zoz:zoz /home/zoz/zoz-pro-ai
'
proot-distro login debian --user zoz -- bash -lc 'bash ~/zoz-pro-ai/paperclip-android/install-debian.sh'

echo
echo "Base installation finished. Paperclip is NOT initialized or running yet."
echo "Next, run: proot-distro login debian --user zoz"
echo "Then: nvm use 24.11.0 && paperclipai onboard"
echo "Choose local-only loopback + embedded PostgreSQL + local disk. Never choose public exposure."
