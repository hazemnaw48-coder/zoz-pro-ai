# ZOZ Pro — Durable Engineering Handoff

Resume from this file and Git history; do not rebuild completed work or mix this repository with the legacy ZOZ AI system.

## Project boundary

- Project: ZOZ Pro — independent Business OS
- Repository: `hazemnaw48-coder/zoz-pro-ai`
- Active task: ZP-012 — Vercel cloud runtime, durable state, and safe event-driven command worker
- Active branch: `feature/ZP-012-vercel-cloud-runtime`
- Baseline commit reviewed for this change: `8ebee6046b36a8100c57f9f8ce9d7dab354b70ea`
- Excluded repository: `zozaimanager2026-design/zoz-ai-control`
- Do not use another similarly named Vercel project or account.

## Runtime architecture

Phone control interface -> authenticated `POST /api/control/commands` -> private Vercel Blob state -> Vercel Queue topic `zoz-pro-control-commands` -> event-driven `api/queue/control-command.js` consumer -> durable command/task updates, result, worker heartbeat and audit activity.

Vercel Cron is a daily readiness/persistence check only. It is not an always-on worker. The local Codex CLI executor and Windows/Tailscale launcher remain separate local engineering tools; they are not the cloud execution path.

## Safe cloud-worker boundary

Supported read-only commands:
- `system:health-check`
- `system:project-summary`

The worker uses an explicit allowlist; it does not run arbitrary shell or Codex CLI instructions. It will not execute financial, destructive, publishing, messaging, credential/account or other external actions. Owner approval records remain intact; the read-only worker blocks approved risky commands that have no dedicated action handler. Task-level completion remains gated by the existing verification checks.

## Storage and retries

- Hosted runtime requires private Blob storage; it must fail closed when `BLOB_READ_WRITE_TOKEN` is missing.
- Cloud queue delivery is at-least-once. The deterministic read-only worker can resume a persisted claim after a retry; completed commands are idempotently skipped.
- Blob ETag/precondition conflicts must be returned as retryable conflicts; never overwrite newer state using a stale write.
- Do not read or print secret values.

## Required environment configuration

Environment names only were inspected for the correct ZOZ Pro Vercel project:
- `ZOZ_CONTROL_TOKEN`: present for Production, Preview and Development.
- `BLOB_READ_WRITE_TOKEN`: present for Production, Preview and Development.
- `CRON_SECRET`: missing at last inspection (2026-10-13). The owner must add it as a sensitive Production variable; add Preview too if testing the Preview Cron route.
The secret values were not read. Variable presence alone does not prove that credentials are valid.

## Verification boundary

- Before this change, CI run `38322330120` (run #292) passed `npm test`, `npm run build` and the Windows launcher checks for baseline commit `8ebee6046b36a8100c57f9f8ce9d7dab354b70ea`.
- Do not treat that baseline CI as verification for the new queue worker. Check the latest GitHub Actions run for the code commit and the follow-up handoff commit before reporting full success.
- Regression coverage exercises the real control API with a test token, claims a safe command, records its result/heartbeat/audit, then verifies persistence through a new request and new store instance.
- No live mobile Preview smoke is confirmed until the owner submits `system:health-check` from the Preview control interface and the resulting command, heartbeat, audit and persistence are read back.
- No merge, production promotion, external send, publishing, financial action or account/secret mutation is authorized while the live smoke/configuration gates remain incomplete.

## Production boundary

Keep the existing production deployment (commit `f7ee581e0c1ab5b05af3b2e1cb91e8843254b474`; deployment `dpl_CJpkqbhELpqJcWDZw2mMJGGxyqff`) intact until all required gates pass. Current Preview deployment for the baseline head was `dpl_CzC9arEVNhTv92UWEn2ZuNCjPmbf`; re-check the latest deployment after each commit.

## Next actions

1. Verify CI for the code commit; resolve all failures and inspect the latest Codex review.
2. Verify the new Preview deployment and safe event-driven queue path without external side effects.
3. Owner adds the missing `CRON_SECRET` in the correct Vercel project without sharing the value.
4. Owner performs the actual authenticated Preview smoke through the mobile UI, refreshes state in a separate request, and checks command ID, worker status/heartbeat, result and audit event.
5. Merge/promote only after those live gates have verified evidence.

## ZP-012 current handoff — 2026-10-13

- Current head at this checkpoint: `19c820f8c1b9c96a8f82ab3d3aca3b6db40b3a9c`.
- The Blob state reader now requests `useCache: false` for mutable state, so separate worker invocations do not read a stale cached snapshot.
- The Tasks view exposes an explicit Assign to Codex action for planned tasks before a cloud diagnostic can be queued.
- CI passed for the current head and its Vercel Preview deployment is Ready. Existing production remains on `f7ee581e0c1ab5b05af3b2e1cb91e8843254b474`; do not merge or promote based on CI alone.
- GitHub review connector is available. The last Codex review attempt could not run because its review usage limit was reached; do not repeat until it resets.
- The remaining gate is a live, owner-authenticated Preview smoke: assign `ZP-006` if still planned, submit `system:health-check`, refresh state in a separate request, and verify command completion, task status `verification`, persisted result, executor heartbeat/mode, and corresponding audit entries.
- Current Vercel connector access returns `403` for deployment inspection, runtime logs, and environment metadata; this is an access limitation, not evidence that the app itself returns an error.
- The daily readiness cron is not the command worker. The queue worker only allows `system:health-check` and `system:project-summary`; it cannot run arbitrary shell/Codex instructions or external/financial actions.


## Scope correction and verified handoff — 2026-10-14 UTC

### Strict system separation

- This repository and this handoff are for **ZOZ Pro only**: `hazemnaw48-coder/zoz-pro-ai`.
- The Vercel connection explicitly labelled **ZOZ Pro** (owner account `hazemnaw48@gmail.com`) is the only Vercel connection to use for the current ZOZ Pro project.
- Authoritative Vercel project ID: `prj_T6J2NwjPcGcOo6Zi4nW31EyS7YDc`, account/team ID: `team_wFgewvIh3gjYHAIqxG6POeN1`, Node.js `24.x`.
- A separate Vercel connection labelled **Vercel** exposes projects including `zoz-ai-control` (`prj_BLhyNy2Rg8hFYVuM6bBMS5Emzbvx`), `zoz_ai_core_v3-2`, and other projects, plus an older similarly named `zoz-pro-ai` project (`prj_KRfSApBtANdNF5BgliSrczuc2eMB`). **Do not use that connection or its project IDs to inspect, change, or deploy ZOZ Pro.** Similar names are not proof they are the same project.
- Keep ZOZ Pro separate from `zozaimanager2026-design/zoz-ai-control`, its Railway service, database, credentials, deployment history, and error investigations. No action on ZOZ AI is authorized by this ZOZ Pro work.
- Deployment/log/secret checks must always pass both the ZOZ Pro connection and exact project ID; never resolve the project by the name `zoz-pro-ai` alone.

### Verified Vercel inventory

- Correct project `prj_T6J2NwjPcGcOo6Zi4nW31EyS7YDc` currently reports `live: false` and its latest listed deployment target is `null` (not a confirmed Production deployment).
- Latest deployment in the correct project at inspection time: `dpl_3XLBERp2RNXWwESic46toFBLR6M1`, state `READY`, branch `feature/ZP-013-isolated-tool-integrations`, commit `a2a81a2b8edc4b6b33c7f93217585e8b8c8f960c`, URL `https://zoz-pro-4chka2yml-hazemnaw48-coder.vercel.app`. This is a Preview build, not proof of production operation.
- PR #14: `feature/ZP-012-vercel-cloud-runtime`, head at inspection `8e4ad373d66a34107ee3d3e6b39924621642ed8f`; CI workflow run #324 passed and its Preview deployment `dpl_Hcw2QEcFvDV8a9k6TQbCeHLbayZG` reported `READY`. PR remains open; the required owner-authenticated smoke is not verified.
- PR #15: `feature/ZP-013-isolated-tool-integrations`, head `a2a81a2b8edc4b6b33c7f93217585e8b8c8f960c`; CI workflow run #389 passed. PR remains a draft. Kaggle connector / kernel contract is not verified end-to-end and this branch does not prove a rendered MP4.
- Vercel API requests for runtime logs, environment metadata, build events, and protected-preview fetch returned `403` under the ZOZ Pro connection during this review. This confirms a connector/access limitation only; it is **not** evidence of an application HTTP 404, and it does not prove the cloud runtime is healthy. No ZOZ Pro app-level 404 has been confirmed in this inspection.
- Environment variable inventory could not be re-checked because of the `403`. The previous 2026-10-13 note said `ZOZ_CONTROL_TOKEN` and `BLOB_READ_WRITE_TOKEN` were present and `CRON_SECRET` was missing then; treat that inventory as stale until safely re-verified. Never read or expose secret values.

### Separate production-center record (Floot)

- The production center is a different project: `ZOZ Pro — Alternate Video Production Center`, Floot project ID `894a0e3a-85c4-43de-b8f7-205db24685b9`. Keep it dedicated to content creation; use Vercel for the ZOZ Pro cloud-control/runtime work.
- Floot project status at this review: unpublished, Free plan; local project data is stored in browser `localStorage`; no cloud synchronization was verified.
- Connected resources reported by Floot: `GEMINI_API_KEY` (Arabic TTS), `GROQ_API_KEY` (draft text), and `KAGGLE_API_TOKEN`. Resource connection alone does not prove the API token works. Code search found no Kaggle implementation yet.
- Floot typecheck was clean; available test run reported one spec passed and zero failed. These tests do not prove audio/video generation, MP4 export, cross-device persistence, or publishing.
- Floot request logs showed `POST /_api/generate-text` returned HTTP 200 at `2026-10-14T03:50:45Z`; this verifies that one text-generation endpoint request returned successfully, not that the complete production workflow is closed.
- A Floot code-search attempt was blocked by the daily build-action limit; the tool reported reset at `2026-10-15T02:00:00Z`. Do not retry metered code-change/search calls before the limit clears.

### Remaining closure gates

1. Restore authorized access specifically to Vercel project `prj_T6J2NwjPcGcOo6Zi4nW31EyS7YDc`; do not switch to the generic Vercel connection.
2. Perform the owner-authenticated Preview `system:health-check`, read back status in a separate request, and verify command completion, task status `verification`, result, `executor.mode=vercel_queue`, heartbeat, persisted state and matching audit events.
3. Verify current environment-variable presence by names only; owner must set `CRON_SECRET` if still missing. Do not merge PR #14 or promote Production until these gates are evidenced.
4. Keep PR #15 a draft until the separate ZOZ Pro Kaggle authorization and exact notebook/MCP execution and artifact-return contract are verified. Do not run paid jobs or launch generation without explicit approval.
5. After the Floot quota resets, continue the separate production-center work: reliable persistent project/asset ledger, verify real TTS output, implement/test a safe Kaggle inspect/status/download path, test actual exported media on a phone, then review video quality and require owner approval before external publishing.
6. Mark publishing complete only after a real platform URL/ID is supplied and verified. Do not claim continuous production or automated publishing from a passing CI/build alone.

No production deployment, merge, environment mutation, secret read, paid generation, external send, or publishing was performed during this audit.


## Production operation correction — 2026-10-14

### User-confirmed prior successful output (preserve as completed history)

The owner confirms that the existing Floot production center has already successfully:
- generated narration audio;
- exported an actual video;
- published that video; and
- saved the video on the owner's phone.

Record this as **owner-confirmed prior success**. Do not downgrade it to “unverified/no production output” in future handoffs. Any later endpoint failures must be diagnosed against the specific new request, not used to invalidate this completed run.

### Build quota vs. production runtime

- Floot's daily build-action limit was reached at inspection, with a reset reported for 2026-10-15T02:00:00Z (05:00 Africa/Cairo). This blocks project editing/build-related tool actions in the connected Floot editor; it does not, by itself, prove that the existing user-facing app, external API endpoints, client-side export, or external publishing integrations have stopped.
- The last available Floot server log showed `POST /_api/generate-text` returning HTTP 200 at `2026-10-14T03:50:45.966Z`. This is evidence that the text endpoint was working at that time; it is not proof of a current live request or of every separate provider.
- Do not create a new Floot project, rebuild, or wait for the editor quota before using already-existing runtime routes. Test production through the current user-facing app when possible; classify each stage separately: brief/research, script, TTS, image generation, scene assembly/render/export, local phone save, and publication.
- When the project-edit tools are quota-blocked, continue work that does not require source edits: research, script/caption/shot-list preparation, running the existing app if available, reviewing generated artifacts, and preparing the next episode pack. Do not claim a runtime call was tested when the blocked tools prevented it.
- If a runtime action fails, capture exact route, time, HTTP status/error body, and stage; do not assume “Floot build limit” is the cause unless evidence connects the failure to that limit.
- The editor/project quota state is not the same as Gemini, Groq, Kaggle, Runway, or Upload-Post quota/billing. Check each provider's own authorization, plan, and limits before spending credits. Do not use paid video generation as a substitute without owner authorization.

### Immediate next content cycle

A ready-to-use draft package was prepared for channel **فكرة**:
- Working topic: why people perceive faces in ordinary objects (face pareidolia).
- Package: Arabic script, 8-scene storyboard, original scene-generation prompts, narration guidance, title/description/hashtags, quality checklist, and cited scientific sources.
- Companion SRT captions are provided as a separate file in the current conversation: `Fikra_Episode_02.srt`.
- This is a prepared production brief only; do not mark the episode rendered, exported, or published until the center's actual artifact, playback, and platform URL/ID are checked.
- Use the existing production center for the audio and export path; this assistant-side package is not a replacement for the center. After a successful run, record the actual exported filename, duration, format, phone playback result, and verified post URL/ID.

### Current implementation limitation

The center project `894a0e3a-85c4-43de-b8f7-205db24685b9` still uses browser `localStorage` for project state and no cross-device cloud sync was verified. This affects durable project continuity, not the fact that the owner has previously exported/published a video successfully. Keep the project as the dedicated production UI; later source changes should decouple the production artifact ledger and queue from editor/build quotas and store history/assets durably, without removing the existing working path.


## 2026-10-14 — ZP-014 private media intake and Studio handoff implementation
- Active system remains **ZOZ Pro only**. Branch `feature/ZP-014-vercel-media-intake` is based on `feature/ZP-012-vercel-cloud-runtime` to retain the actual Vercel runtime foundation; it is intentionally not based on the docs-only ZP-014 branch.
- Added `src/media-assets.js`: media metadata validation, private Blob asset/manifest/receipt paths, direct signed upload/download URLs, upload completion validation, idempotent receipt handling, and explicit Google AI Studio integration readiness. Supported inputs: MP4/MOV/WebM, MP3/M4A/WAV, PNG/JPG/WEBP, SRT/VTT, JSON/TXT. Initial app limits: video 250 MB, other files 25 MB; signed URLs expire in 15 minutes for upload and 5 minutes for download.
- Added authenticated API routes in `src/server.js`: owner routes for upload ticket, list, completion, and download; dedicated Studio-token routes for health, listing, download URL, reverse upload ticket, and validated import receipts. The Studio token is separate from owner and ZOZ AI credentials.
- Updated `package.json` to require `@vercel/blob ^2.4.0` for signed URLs and syntax-check `src/media-assets.js`.
- Added `test/media-assets.test.js` for metadata validation and conservative integration status. Added an upload panel and asset list to the existing ZOZ Pro Content Factory UI; this supports manual file export/import and does not yet prove that a generator API is connected.
- Added `docs/GEMINI_ZP014_STUDIO_CLOSURE_PROMPT.md` with an execution brief for the existing intended ZOZ Pro Google AI Studio project, API contract, secure credential setup, actual video generation, export/import receipt, playback verification, and no-public-publish guard.
- Vercel docs confirm private Blob and signed URLs are generally available; signed URLs are narrowly scoped to a single object/operation and expire. Sources: https://vercel.com/changelog/vercel-blob-private-blob-is-now-generally-available and https://vercel.com/changelog/signed-urls-are-now-available-for-vercel-blob.
- **Not yet verified/complete:** this branch has not yet passed CI; the private Blob store and `BLOB_READ_WRITE_TOKEN` are not verified; `ZOZ_PRO_STUDIO_INTEGRATION_TOKEN` is not verified; Google AI Studio's actual project identity and its server-side secret capability have not been confirmed; no real file has yet been transferred or generated through this bridge. Publishing remains disabled and nothing was deployed or merged.
- Next: wait for GitHub Actions results, fix every failure, inspect the SDK APIs against the resolved package, then configure private Blob and separate Studio secret in Vercel only after the project is verified. Ask Gemini to work on its existing ZOZ Pro Studio using `docs/GEMINI_ZP014_STUDIO_CLOSURE_PROMPT.md`; do not use any ZOZ AI Studio app. Run one real file round-trip and record evidence before calling this operational.


## 2026-10-14 — Google AI Studio source identified and media bridge added
- Identified the existing Google AI Studio source repository under the ZOZ Pro owner GitHub account: `hazemnaw48-coder/zoz-content-production-studio-source`. It is a React/Vite/Express Studio with a real FFmpeg render engine, Gemini script/TTS services, MP4/SRT/thumbnail/JSON output artifacts, and existing output files. This is the intended Studio source, not the legacy ZOZ AI system.
- Created branch `feature/ZP-014-zozpro-media-handoff` in that Studio source and draft PR #3: https://github.com/hazemnaw48-coder/zoz-content-production-studio-source/pull/3.
- Studio source CI passed on commit `7320a2378c0115467f7fc30863cf74d8f2ae5925`: storyboard + media-bridge tests, TypeScript lint/type-check and production build.
- Studio branch adds an Asset Library panel to list/import ZOZ Pro media, an explicit post-render export button for MP4/SRT/thumbnail/JSON, server-side ZOZ Pro API calls, SHA-256 + ffprobe validation for imported video, import receipts, dedicated action/integration secrets, and a runbook. No live secrets are configured and no real file round-trip has run yet.
- In this ZOZ Pro branch, added `POST /api/content-factory/studio/assets/{assetId}/complete` to finish Studio-originated uploads; CI passed on commit `8d7e1a0e0433c46c90d9e444443c310254f24392`.
- ZOZ Pro media bridge draft PR #16: https://github.com/hazemnaw48-coder/zoz-pro-ai/pull/16 (target base `feature/ZP-012-vercel-cloud-runtime`, not merged). CI passed for media intake, tests, build and Windows launcher checks before the latest state-note update.
- Required secret names: in ZOZ Pro Vercel, `BLOB_READ_WRITE_TOKEN` and `ZOZ_PRO_STUDIO_INTEGRATION_TOKEN`; in Google AI Studio server-side Secrets, `ZOZ_PRO_MEDIA_API_URL`, matching `ZOZ_PRO_STUDIO_INTEGRATION_TOKEN`, separate `ZOZ_PRO_STUDIO_ACTION_TOKEN`, and optional `ZOZ_PRO_VERCEL_BYPASS_SECRET` only if the selected Preview is protected. Never place secrets in source or frontend code.
- Existing Vercel project is not live production and Preview is SSO-protected. No private Blob store could be verified through available read-only connector operations; do not create a duplicate store blindly. Next: verify existing private Blob store in Vercel dashboard, configure server-side secrets in each correct system, then test one real file round-trip and actual video playback. Social publishing remains disabled; this bridge is not yet proof of publication.
- Floot source inspection/editing is still blocked until 2026-10-15 02:00 UTC / 05:00 Cairo. Do not upgrade or pay.
