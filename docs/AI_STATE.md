# ZOZ Pro AI State

This file is the durable handoff record for engineering sessions. Resume from this file and Git history; do not recreate completed work.

## Project
ZOZ Pro — independent Business OS
Repository: `hazemnaw48-coder/zoz-pro-ai`
Legacy repository excluded: `zozaimanager2026-design/zoz-ai-control`

## Current Engineering Stage
ZP-006 — hardened CEO → Task → Command → Codex → Verification → Audit workflow

## Current Branch
`feature/ZP-005-one-command-local-runtime`

## Latest Commit
Branch work is in progress on `feature/ZP-006-ceo-task-command-audit`.

## ZP-006 Changes
- Every control command is bound to an existing Codex task.
- Codex cannot claim a command for a completed/failed/blocked task.
- Risky command approval remains an explicit owner gate.
- Rejected approvals now cancel the waiting command and write an audit event.
- Codex Executor advances the bound task through assignment and execution, then leaves it in verification.
- Task completion now requires an explicit verification request with every required check passing.
- Verification records evidence, verifier, commit SHA, project verification state, and audit activity.
- No deploy or merge is performed by the executor.

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
Run repository CI for ZP-006, review the branch, then open a draft PR for owner review. Do not merge or deploy until explicit owner approval.

## Computer-Only Action
Only the actual Windows runtime activation requires the user's computer:
`.scripts/start-zoz-pro.ps1`
Everything that can be safely implemented, reviewed, tested through repository/CI tooling, and documented can continue without manual file editing.

## Last Agent
Codex — primary implementer

## Deployment Status
not_deployed


## 2026-10-14 — ZOZ Pro Groq integration checkpoint
- Active system: **ZOZ Pro only**. Repository `hazemnaw48-coder/zoz-pro-ai`; integration branch `feature/ZP-013-isolated-tool-integrations`; PR #15 remains open/draft. Do not merge or deploy production.
- Added `src/groq-text-client.js`, Content Factory status registration, and owner-authenticated `POST /api/content-factory/text/draft`. The route is draft-only, stores up to 25 drafts in ZOZ Pro state, has input caps, 1200 output-token cap, 15-second timeout, no tool calling, no send/publish, and no retry or paid fallback on 429.
- Server secret expected: `GROQ_API_KEY`; optional model setting `GROQ_MODEL`; default model `qwen/qwen3.8-27b` is a Preview candidate and must not be considered live-verified. No key was created or configured, and no real Groq request has been sent.
- Never use the Groq organization/key associated with `zozai.manager2026@gmail.com` inside ZOZ Pro. Use a separate owner-authorized credential under `hazemnaw48@gmail.com`.
- Added deterministic client tests and status assertions. Next: add the Content Factory UI, finish route-level persistence/auth tests, run GitHub Actions, then inspect Vercel Preview. Runtime logs remain 403; end-to-end health is not yet verified.
- Floot daily action limit blocked reading resources/files for Cloud Runtime `e63d1fa8-d477-4708-bed1-e3f539ef224e` and Alternate Video Production Center `894a0e3a-85c4-43de-b8f7-205db24685b9`. After reset, inspect both read-only before choosing the final runtime endpoint or configuring secrets.
- Keep Gemini and existing image/video/render/export pipeline unchanged. Groq is only a text-draft assistant. Owner approval remains required for external sends, publishing, financial, sensitive, destructive, and production-impacting actions.


## 2026-10-14 — ZP-014 central media handoff checkpoint
- Active system: **ZOZ Pro only**; repository `hazemnaw48-coder/zoz-pro-ai`, owner GitHub connection `hazemnaw48@gmail.com`.
- Created isolated branch `feature/ZP-014-media-handoff-map` from `feature/ZP-013-isolated-tool-integrations`. No merge or deployment.
- Added `docs/CENTRAL_MEDIA_HANDOFF_AND_PUBLISHING_PLAN.md` documenting system boundaries, intended multi-generator file handoff, central review/publishing flow, current verified code, blockers, safety controls and acceptance criteria.
- Required architecture: preserve the existing Floot Production Center interface; make ZOZ Pro Content Factory the secure intake/manifest/review/audit hub; target the specifically confirmed Google AI Studio workspace for review; publish only through a confirmed publisher with explicit owner approval. Cross-system boundary is media files only, never code, secrets, customer records, or database state.
- Current connectors are not proof of a live Google AI Studio connection or actual media transfer. `src/content-studio-client.js` expects a separate token and protected `/api/zozpro/health` endpoint; `src/content-publisher.js` expects a reachable MP4 URL and Upload-Post account. Publishing remains disabled by default.
- Current evidence: PR #14 Vercel runtime CI passed on `a32f36cecc9078c371a214a6a9898846bb2d73de`, but Protected Preview Smoke failed; PR #15 is draft/open and CI passed on `a2a81a2b8edc4b6b33c7f93217585e8b8c8f960c`. No production deployment or merge is authorized.
- Next: inspect PR #14 Protected Preview Smoke failure; implement and test one minimal authenticated media-intake/manifest slice on this branch; inspect Floot export routes after daily limit reset; confirm exact ZOZ Pro Google AI Studio workspace before configuring integration.
- Keep ZOZ AI and its store/marketing/automation/visual capabilities untouched and independent. No credentials copied between systems. No paid upgrades.
