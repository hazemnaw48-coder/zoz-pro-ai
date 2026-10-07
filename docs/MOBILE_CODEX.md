# ZOZ Pro Mobile → Codex Executor

The mobile Control Plane stores owner commands durably. The Codex Executor runs on the computer that has the ZOZ Pro checkout and Codex CLI.

## Start

From the ZOZ Pro repository:

```powershell
.\scripts\start-codex-executor.ps1
```

Optional remote control URL:

```powershell
$env:ZOZ_PRO_CONTROL_URL="https://YOUR-ZOZ-PRO-HOST"
.\scripts\start-codex-executor.ps1
```

The executor polls the queue, claims one normal command at a time, runs Codex in a workspace-write sandbox, and writes the result and current Git commit back to ZOZ Pro.

## Safety

- Risk-tagged commands remain behind owner approval.
- No deploy or merge to main.
- No legacy ZOZ AI access.
- No credentials, financial, account, WhatsApp, or external-service actions.
- Secrets remain outside the repository.

## Offline computer

The phone can queue commands while the computer is offline. They remain pending until the executor reconnects. The computer must be powered on and the executor running for local Codex execution.
