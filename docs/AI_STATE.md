# ZOZ Pro AI State

This file is the durable handoff record for engineering sessions. Resume from this file and Git history; do not recreate completed work.

## Project
ZOZ Pro — independent Business OS
Repository: `hazemnaw48-coder/zoz-pro-ai`
Legacy repository excluded: `zozaimanager2026-design/zoz-ai-control`

## Current Engineering Stage
ZP-005 — One-command local runtime and phone-to-Codex bridge preparation

## Current Branch
`feature/ZP-005-one-command-local-runtime`

## Latest Commit
`20958823a822c56a15a750535bcc966325f2df44`
Message: `feat: add one-command ZOZ Pro local runtime launcher`

## Completed Product Foundations
- Application skeleton and durable local state store
- CEO/task workflow foundation
- Explicit approval gates
- Activity/audit trail foundation
- Opportunities and intelligence
- CRM and contacts
- Outreach and follow-up records
- Mobile control plane
- Local Codex Executor bridge
- Tailscale Serve runtime path
- One-command Windows runtime launcher

## Runtime Architecture
Phone -> Tailscale Serve -> Windows ZOZ Pro server -> local Codex Executor -> current Git checkout

Vercel is optional preview only and must not block development or runtime.
Windows local state remains authoritative during the local-first phase.
Do not use Tailscale Funnel for the owner control plane.

## Current Runtime Scripts
- `scripts/start-zoz-pro.ps1` — starts server, configures Tailscale Serve, and starts Codex Executor if not already running.
- `scripts/start-zoz-pro-tailnet.ps1` — server + Tailscale Serve launcher.
- `scripts/start-codex-executor.ps1` — local Codex Executor launcher.
- `scripts/codex-executor.mjs` — polls the control plane and runs approved non-risky implementation commands in the local checkout.

## Verification Status
The latest ZP-005 commit has not yet produced a GitHub Actions workflow run; do not claim CI success for this commit until a run is observed.
Earlier verified commits passed `npm test` and `npm run build`.
No deployment to production is authorized.

## Owner Approval / Safety Boundaries
- No merge to `main` without verification and explicit owner approval.
- No deploy without verification and explicit owner approval.
- Financial, sensitive, destructive, deployment, credential/account, external-send, and irreversible actions require explicit owner approval.
- One coding agent per task.
- Never access or modify the legacy ZOZ AI repository.

## Next Engineering Step
ZP-006 — harden the CEO -> Task -> Command -> Codex -> Result/Failure -> Audit workflow and make the mobile control plane the single operational entry point.

## Computer-Only Action
Only the actual Windows runtime activation requires the user's computer:
`.scripts/start-zoz-pro.ps1`
Everything that can be safely implemented, reviewed, tested through repository/CI tooling, and documented can continue without manual file editing.

## Last Agent
Codex — primary implementer

## Deployment Status
not_deployed
