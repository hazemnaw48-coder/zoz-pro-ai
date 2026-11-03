#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$(id -u)" -eq 0 ]; then
  echo "ERROR: Run this installer as the non-root Debian user 'zoz', not root."
  exit 1
fi

ARCH="$(dpkg --print-architecture)"
case "$ARCH" in
  arm64|amd64) ;;
  *) echo "Unsupported Debian architecture: $ARCH"; exit 1 ;;
esac

sudo apt-get update
sudo apt-get install -y ca-certificates curl git build-essential python3 procps psmisc

export NVM_DIR="$HOME/.nvm"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
  curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
nvm install 24.11.0
nvm alias default 24.11.0
nvm use 24.11.0

npm install --global paperclipai @google/gemini-cli

echo
echo "Installed versions:"
node --version
npm --version
paperclipai --version
gemini --version
echo
echo "INSTALL COMPLETE. No Paperclip database has been initialized yet."
echo "Next: run 'paperclipai onboard' interactively as this non-root user."
