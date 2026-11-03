# Paperclip on Android — ZOZ Pro (free local setup)

This is an **experimental community setup**, not an officially supported Paperclip Android deployment. It keeps Paperclip's database and encrypted secrets on the phone and does not connect to either existing Supabase project.

## What this does

- Installs Debian in Termux using proot-distro.
- Creates a non-root Linux user named `zoz` (required because embedded PostgreSQL refuses root).
- Installs Node.js 24.11.0, Paperclip CLI, and Gemini CLI.
- Runs Paperclip with its own embedded PostgreSQL and local disk storage.
- Imports the ten-agent ZOZ Pro company package into a new local Paperclip company after a dry-run and explicit confirmation.

## What it does not do

- It does not install anything into Supabase, change production or preview data, deploy Edge Functions, or alter the existing ZOZ app.
- It does not set up paid hosting, a paid API plan, or billing.
- It does not connect Qwen, Claude, GitHub, Notion, Canva, Runway, YouTube, or KDP automatically.
- It does not enable scheduled heartbeats or automatically publish anything.
- It does not guarantee 24/7 availability. Paperclip runs only while Android keeps Termux/PRoot alive. Battery optimization, memory pressure, reboot, or closing Termux can stop it.
- It does not prove Android/PRoot is a supported upstream Paperclip platform. The install and embedded PostgreSQL startup must pass on the actual phone before it is considered usable.

## Requirements

- Android ARM64 (the provided Vivo V2342 is expected to be ARM64, but the script checks the environment).
- Termux installed from the official F-Droid or Termux GitHub source. Do not mix Termux app/plugin builds from different signing sources.
- Several GB of free internal storage recommended for Node, Paperclip, database, logs and workspaces.
- Reliable Wi-Fi for initial downloads.
- Termux battery use allowed; optionally disable battery optimization for Termux if Android keeps killing it.

Official Termux sources:
- https://f-droid.org/packages/com.termux/
- https://github.com/termux/termux-app

## Install

Open Termux (not a browser terminal) and run:

```bash
pkg update -y
pkg install -y git proot-distro curl
proot-distro install debian
```

Then download this repository branch inside Debian and run the installer as root (only the OS package/user setup runs as root):

```bash
proot-distro login debian -- bash -lc 'apt-get update && apt-get install -y git curl ca-certificates sudo passwd procps psmisc'
proot-distro login debian -- bash -lc 'id zoz >/dev/null 2>&1 || useradd -m -s /bin/bash zoz; git clone --branch docs/paperclip-zoz-orchestration --single-branch https://github.com/hazemnaw48-coder/zoz-pro-ai.git /home/zoz/zoz-pro-ai; chown -R zoz:zoz /home/zoz/zoz-pro-ai'
proot-distro login debian --user zoz -- bash -lc 'bash ~/zoz-pro-ai/paperclip-android/install-debian.sh'
```

The install script does not run onboarding, import a company, add keys, or start a service. It only installs software and checks versions.

## First launch

Run onboarding interactively as the non-root user:

```bash
proot-distro login debian --user zoz
nvm use 24.11.0
paperclipai onboard
```

Choose local-only / loopback exposure and the embedded PostgreSQL + local disk options. Do not choose public exposure or an external database. If the wizard offers a hosted or paid provider, skip it. Keep the server bound to localhost/127.0.0.1. When onboarding finishes, exit the Debian shell.

## Import the company

Make sure Paperclip is running, then in Termux run:

```bash
bash ~/zoz-pro-ai/paperclip-android/import-company-termux.sh
```

The script previews the import first. It imports as a **new company**, never merges or replaces an existing one. It asks you to type `IMPORT ZOZ PRO` before applying. The package includes the CEO, nine specialists, one project and one QA smoke-test task. Paperclip imports agent heartbeats disabled; leave them disabled until the first model test passes.

## Start / status / stop

```bash
bash ~/zoz-pro-ai/paperclip-android/start-termux.sh
bash ~/zoz-pro-ai/paperclip-android/status-termux.sh
bash ~/zoz-pro-ai/paperclip-android/stop-termux.sh
```

Open this on the same phone only: http://127.0.0.1:3100

Do not use LAN binding, port forwarding, public tunnels or expose port 3100 to the internet. The local-trusted mode is appropriate only while bound to loopback on a single-user phone.

## Gemini setup

The imported agents use Paperclip's built-in `gemini_local` adapter and the Gemini CLI. The package declares an optional `GEMINI_API_KEY` input; it does not contain any key. You may use a Gemini CLI login or a free-tier API key where available. Follow the current Gemini CLI sign-in and quota terms. Do not enable billing or assume multiple API keys multiply quotas.

Configure the model credential through Paperclip's own encrypted Secrets UI after logging into the local instance. Never paste a key into GitHub, Notion, a company markdown file, or this chat. If you cannot authenticate the CLI on Android, stop at setup and record the error; do not enable heartbeat or assume the agent is ready.

This first package uses one Gemini CLI provider lane. It does **not** implement account rotation between the three Gemini accounts or Qwen routing. Those require separate verified credentials, Paperclip secret references, model-selection tests and quota-aware routing. Add them only after the first single-agent smoke test succeeds.

## Backups

Run:

```bash
bash ~/zoz-pro-ai/paperclip-android/backup-termux.sh
```

The backup is written under Debian user's home in `~/paperclip-backups`. Copy it somewhere safe using your own device backup process. Keep the Paperclip secrets master key alongside the backup in a separately protected location; without that key encrypted credentials cannot be recovered. Do not upload the key to GitHub.

## Official Paperclip references

- Installation: https://docs.paperclip.ing/guides/getting-started/installation/
- CLI installation: https://docs.paperclip.ing/reference/cli/installation/
- Company import: https://docs.paperclip.ing/reference/cli/company/
- Gemini adapter: https://docs.paperclip.ing/reference/adapters/gemini-cli/
