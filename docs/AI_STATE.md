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


## New task — Android Flow Bridge (2026-10-30)

- Owner requested a phone-based Android companion that connects the existing ZOZ Pro agent to the three existing Google Flow accounts, receives generated clips, assembles the video, and returns it to the existing intake/review/publishing path.
- Feature branch created from `main`: `feature/zoz-android-flow-bridge`.
- Architecture and safety gates recorded in `docs/ANDROID_FLOW_BRIDGE_SPEC.md` (commit `187137dbdaa212d8a0558b024e847924d274ab93`).
- No APK, native Android module, backend queue, Flow UI automation, or real device test exists yet. Do not imply otherwise.
- Existing production `zoz-pro-agent` v32 and `zoz-pro-agent-control` v5 remain untouched.
- Existing `zoz-pro-ai-video-studio` v5 was inspected: it calls a public Hugging Face LTX Video Space for a single six-second clip and uses Gemini TTS. It is a separate experimental generator, not Google Flow integration and not proof of full video assembly.
- The three Flow accounts recorded in the web UI are not proof of a supported Flow API or reusable Google OAuth access for programmatic control. Reuse the already signed-in Flow sessions on the owner's Android device; never collect Google passwords, cookies, browser storage, or API keys in the bridge.
- First implementation sequence: inspect exact current intake endpoint contract and repo Android/build conventions; create a minimal Android app + CI APK artifact on this feature branch; implement owner-authenticated job receipt; then assisted Flow prompt handoff, clip import, on-device assembly, and resumable return to intake.
- Full Flow UI automation through AccessibilityService is a separate policy-gated milestone. Keep assisted/manual mode available; do not bypass quotas, CAPTCHA, account security, payment prompts, or consent screens.
- Constraints: free-only; no billing activation, paid generation, paid hosting, new project, destructive changes, public publication, or weakening existing owner approvals.


### Android foundation implementation update — 2026-10-30

- Feature branch now contains a standalone Android Gradle/Compose app scaffold under `android/`, package `com.zozpro.flowbridge`, plus GitHub Actions workflow `.github/workflows/android-flow-bridge.yml`.
- Prototype UI currently opens the Flow web entry, copies a scene prompt to clipboard, and imports multiple local video files via Android's document picker while preserving read permission where granted.
- Kotlin Compose compiler plugin was explicitly added for Kotlin 2.0.21.
- This is only a local assisted-mode shell. It does not yet authenticate to Supabase, receive agent jobs, automate Flow, download clips from Flow, assemble video, or upload to intake.
- CI workflow is configured to build a debug APK on pushes/PRs affecting the Android module; its run result has not yet been independently verified from this handoff.
- No production backend, database schema, existing function, OAuth credential, channel authorization, or publication policy was changed.
- Latest known feature-branch commits include app scaffold and Compose compiler configuration; verify the branch head and CI result before distributing an APK.


## Android App Factory section added — 2026-10-30

- Added `docs/ANDROID_APP_FACTORY.md` defining the permanent Android App Factory: app portfolio, requirements, engineering, CI builds, test evidence, signing/release, operations, capability registry, risk-based owner approvals, security, and platform limits.
- Added `android-app-factory.html` as a phone-first Arabic App Factory section with the current app portfolio, lifecycle, autonomy policy, and honest implementation status.
- Updated `index.html` on the feature branch to add a dedicated **إنتاج تطبيقات Android** tab beside analysis/upload. This is not yet on the live production Pages branch.
- Updated `sw.js` to cache the new App Factory page and updated the PWA manifest description.
- Current portfolio entries: ZOZ Device Agent / Flow Bridge (initial code scaffold); ZOZ Browser Agent (planned); ZOZ Video Factory (planned); ZOZ KDP Workspace (planned).
- The new section is a documentation/control-center UI only. It is not yet backed by a persistent app registry or build/test records in Supabase.
- No production Supabase tables, RLS policies, secrets, existing YouTube flows, or publication permissions were changed.
- No APK build, device pairing, browser automation, Flow automation, KDP submission, or Play Store release is claimed complete.
- Next: inspect CI status for the latest feature branch head; verify APK build; then inspect production schema/RLS before designing additive app-project/device/job tables.


## Extended Android execution design — 2026-10-30

- Added `docs/ZOZ_DEVICE_AGENT_SPEC.md`: owner-bound device pairing, short-lived scoped grants, typed job envelopes, idempotency, local queue, cancellation, revocation, and acceptance tests.
- Added `docs/ZOZ_BROWSER_AGENT_SPEC.md`: on-device sessions, origin allowlists, capability levels, approval before submissions, and explicit prohibition on bypassing MFA/CAPTCHA/quotas.
- Added `docs/ZOZ_VIDEO_FACTORY_SPEC.md`: local import, metadata inspection, stream-copy remux when compatible, explicit transcode fallback, source preservation, integrity checks, and resumable private upload.
- Added `docs/ZOZ_KDP_WORKSPACE_SPEC.md`: automated manuscript/package preparation and owner-controlled KDP submission.
- Expanded Android App Factory page with links to all four specifications.
- Updated Flow Bridge app to persist scene prompt and selected content URI references locally, restoring only files for which Android still grants persisted read permission. Clearing the in-app list does not delete source files.
- Latest successful general ZOZ Pro CI on the branch: run 41018546263 (before the newest Android persistence commit). Android build workflow run 41018671491 is queued/in progress at the time of this note; no APK artifact has yet been verified.
- Android workflow setup now successfully passed Android SDK setup and package installation in run 41018541159, but that run is still compiling. A newer run for the persistence changes is active.
- No production Supabase schema or RLS changes have been made because the current authorized SQL path was previously blocked; do not create device pairing endpoints or claim server-side device execution until additive schema and owner-scope policies are safely implemented and verified.
- Browser automation, autonomous Flow generation, local video assembly, direct KDP access/submission, device pairing, and Play Store release remain unimplemented and must not be described as live.


## Android device execution — production work added 2026-10-30

- Production project `oxyzxbkwhafzaztraowc` now has additive device/app factory tables from migrations `zoz_pro_device_runtime_and_android_app_factory`, `zoz_pro_device_pairing_challenges`, and `zoz_pro_device_intake_source_link`.
- Deployed `zoz-pro-device-agent` ACTIVE v3. Owner-authenticated actions: create 5-minute one-time pairing code, list/revoke paired devices, enqueue typed allow-listed jobs, approve jobs, list job history. Device-authenticated actions: pair exchange, heartbeat, poll one job, and report completion. Tokens are stored as hashes server-side.
- Pairing also issues a separate channel-scoped intake token for Hazem Ahmed. Device revocation disables both device credential and associated intake source.
- `channel-control.html` on this feature branch now includes Android pairing, device list/revocation, prompt dispatch, job approval, and status display.
- Android app now includes encrypted device/intake token storage, WorkManager 15-minute best-effort polling, visible Flow launch/prompt copy tasks, local MP4 stream-copy assembly with compatibility rejection, and chunked upload of final MP4 to existing ZOZ intake.
- Existing ZOZ autonomous worker can advance an owner-approved intake asset through private YouTube upload. It does not publish publicly; public publication remains an owner-confirmed operation.
- The current app does not autonomously press Generate in Google Flow, bypass Flow quotas, perform unrestricted UI control, or automate Amazon KDP. Flow generation is assisted by opening the signed-in site and copying prompts. KDP direct connector remains absent.
- The latest Android build for commit `c13e46b77c259f00b7a3ee644b4d9b76c2130f90` is still under GitHub Actions validation at note time. Earlier scaffold builds succeeded, but do not distribute an earlier APK as if it contains current pairing/media functionality.
- Real Android device pairing, real clip assembly, end-to-end intake upload, and private YouTube upload still need physical-device acceptance testing. No production YouTube public publishing or privacy/metadata changes were enabled.
