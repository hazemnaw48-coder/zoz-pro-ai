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

## Windows auto-start

Configure the token and control URL once:

```powershell
.\scripts\configure-codex-executor.ps1 -Token "<YOUR_OWNER_TOKEN>" -ControlUrl "https://YOUR-ZOZ-PRO-HOST"
```

Then install the per-user logon task:

```powershell
.\scripts\install-codex-executor-task.ps1
```

Remove it with:

```powershell
.\scripts\remove-codex-executor-task.ps1
```

The real token is never committed to the repository.
