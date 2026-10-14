# ZOZ Pro — Central Media Handoff and Publishing Plan
Date: 2026-10-14
Status: design checkpoint committed to an isolated branch; NOT deployed, NOT merged.

## System boundary — authoritative
- ZOZ Pro source of truth: `hazemnaw48-coder/zoz-pro-ai`, owner connection `hazemnaw48@gmail.com`.
- ZOZ AI legacy system: `zozaimanager2026-design/zoz-ai-control`, manager connection `zozai.manager2026@gmail.com`.
- Never combine repositories, credentials, database state, deployment settings, automation, or channel accounts. ZOZ Pro must not read or write the ZOZ AI repository.
- The requested cross-system relationship is an explicit media-file handoff only. No code, customer data, account tokens, or database migration between systems.
- Floot remains the existing visual creation interface. Do not rebuild it or make its daily code-action quota the runtime dependency.
- Vercel is the intended ZOZ Pro cloud runtime/preview path; never use the legacy ZOZ AI Railway service for ZOZ Pro.
- Google AI Studio used as the ZOZ Pro review/publishing workspace must be identified by its actual project/account before any live connection is configured. Similar app names are not proof of system ownership.

## Desired operating flow
1. Any authorized image/video/audio/text generator produces an artifact in its own workspace.
2. The generator exports a real file plus metadata: job ID, title, description, format, dimensions, duration, codec/streams, creation time, source system, checksum, caption/subtitle files, and thumbnail when available.
3. Artifact is transferred using an explicit export/import or a dedicated authenticated upload endpoint. Until a real endpoint is implemented and tested, manual file selection is an honest fallback; do not claim automatic transfer.
4. ZOZ Pro Content Factory receives the file and validates type, size, checksum, video streams and manifest. It stores a durable private master and records a database manifest with source and audit history.
5. The Google AI Studio publishing workspace is the human review gate: preview the actual video, verify title/description/captions/thumbnail, then approve/reject. Do not confuse Google AI Studio Build mode with a social-platform publishing API; identify the actual publisher and destination account.
6. Only after owner approval can the selected social platform receive a submission. Publishing status must be reconciled from provider evidence and the final post URL; a queued response is not success.
7. Preserve the source file and audit log. A failed transfer or uncertain publish outcome must be reconciled, not blindly retried.

## Roles and boundaries
- Floot Production Center: retain existing layout and creation experience; continue generating/organizing content. Provide a documented export/handoff action where technically possible.
- Other generators (including the user-confirmed Qwen workflow): continue as independent generators; support file import/export first, API only after official support is verified.
- ZOZ Pro Content Factory: central intake, manifest, file validation, durable storage, approval queue, audit trail, and publishing orchestration.
- Google AI Studio: target review/publishing workspace as requested, subject to confirming the exact app/account and what publishing capability/API it actually supports.
- ZOZ AI: keep its existing store, marketing, automation, visual capabilities and working departments operational within ZOZ AI. Its artifacts may be exported as files into ZOZ Pro only through explicit handoff. Never copy secrets or internal state.

## Current repository evidence (ZP-013 branch)
- `src/content-factory.js` has status entries for the ZOZ Pro control plane, local Codex executor, Content Studio, GPU worker, Kaggle MCP, Groq text drafting, Claude API, media renderer, and publishing.
- `src/content-studio-client.js` implements a read-only authenticated handshake to `/api/zozpro/health`. The required protected endpoint and separate ZOZ Pro token must exist in the target studio; no legacy fallback is permitted.
- `src/gpu-worker-client.js` similarly verifies a worker without starting rentals or jobs.
- `src/kaggle-mcp-client.js` performs read-only MCP discovery only; it does not start a notebook.
- `src/content-publisher.js` currently expects `ZOZ_CONTENT_STUDIO_URL/outputs/<jobId>/video.mp4`, Upload-Post credentials/profile, and the feature flag. It explicitly treats settings as unverified and publishing disabled by default. This is a planned connector contract, not proof of a real media handoff or live publishing.
- Current code does NOT yet prove that all generators export into one studio, that the Google AI Studio app is integrated, that the final MP4 is stored durably, or that a real YouTube/social publication succeeded.
- Existing Floot production center ID `894a0e3a-85c4-43de-b8f7-205db24685b9` is distinct from Floot Cloud Runtime `e63d1fa8-d477-4708-bed1-e3f539ef224e`. Preserve both; do not assume they are the same app.

## Required implementation order
A. Confirm the exact Google AI Studio workspace/project that belongs to ZOZ Pro; verify access without changing the ZOZ AI apps.
B. Inspect Floot production-center export/storage routes and the existing render path once its daily operation limit resets. Do not create another Floot project.
C. Define one intake contract in ZOZ Pro: `POST /api/content-factory/assets` (authenticated), a server-issued upload URL or safe streaming upload, manifest schema, idempotency key, checksum verification, size/type limits, and audit entry. Never put server secrets in browser code.
D. Store actual media in private durable object storage and metadata in durable DB. If no suitable free-tier storage is available, stop and report the limitation rather than pretending localStorage or Vercel ephemeral disk is durable.
E. Provide a generator adapter registry: `manual_file_import` first; additional adapters only after the provider's official API/auth/usage terms are confirmed. Keep Qwen's successful manual file export usable.
F. Implement review UI in the existing ZOZ Pro Content Factory; retain original media, thumbnail, SRT/VTT, manifest, validation results, and explicit approve/reject decision.
G. Implement publishing adapter only for a confirmed publisher/account. Require an explicit owner-approved `external_send` approval and separate submit action. Default privacy to unlisted/private for acceptance tests.
H. Verify with one real short test clip end-to-end: generate -> export -> import -> checksum/media probe -> durable storage -> mobile preview/playback -> owner approval -> test publication -> confirm final URL. Record evidence and do not claim success until every step passes.

## Acceptance checks
- Correct system/repository/account used; no writes to ZOZ AI during ZOZ Pro work.
- Floot interface is preserved; no rebuild or unapproved deployment.
- MP4 is real playable video (not a slideshow substitute), H.264, yuv420p, portrait 1080x1920 or documented source dimensions, 30 fps target, AAC audio when available; timing checked with ffprobe/equivalent.
- Subtitles and thumbnail retained when supplied; checksum and metadata match the stored bytes.
- File and metadata survive a new server instance and can be played on the user's phone.
- Every transfer and review decision has an audit record.
- Publishing requires owner approval; provider confirmation and final post URL required before status is marked published.
- No secret values, customer databases, or credentials cross system boundaries.
- No merge to main or production deployment until CI, review, and explicit owner approval.

## Current blockers / next action
- Floot metered build/read actions were at the daily limit; reported reset is 2026-10-15 05:00 Cairo. Do not pay or upgrade.
- Vercel project `zoz-pro-ai` exists but latest deployment was reported READY while not live and SSO-protected. Do not treat this as a public production runtime.
- PR #14 (Vercel runtime) is open; latest CI run on commit `a32f36cecc9078c371a214a6a9898846bb2d73de` passed, but the Protected Preview Smoke workflow failed. This needs diagnosis before calling the runtime operational.
- PR #15 (isolated integrations) is draft/open; CI passed on commit `a2a81a2b8edc4b6b33c7f93217585e8b8c8f960c`.
- Next: inspect the PR #14 smoke failure, then continue implementation on this isolated branch with a small intake/manifest slice and tests. Do not merge or deploy.
