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

## What the phone can and cannot do

The phone is the owner control surface. It can create and queue a task, inspect executor state, approve/reject gated actions, and read results.

Codex execution is performed by an authorized executor. In the current implementation this is the local Windows Codex CLI worker. If the worker is offline, the command remains queued; the phone does not pretend that execution happened.

This separation is intentional: ZOZ Pro remains usable from the phone without requiring an active Codex session, while Codex becomes available whenever an authorized executor connects.
