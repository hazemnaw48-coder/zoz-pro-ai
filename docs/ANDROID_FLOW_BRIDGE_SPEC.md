# ZOZ Flow Bridge — current implementation record

## Objective
A native Android companion to the existing ZOZ Pro production project. It is an owner-bound execution device for narrowly scoped tasks, local video handling, and intake transfer.

## Production backend now deployed
- Project: `oxyzxbkwhafzaztraowc`.
- Production Edge Function: `zoz-pro-device-agent`, ACTIVE v32, `verify_jwt=false` at the edge because the function validates the owner JWT or the device-bound hashed token internally.
- Additive production tables:
  - `zoz_pro_device_registry`
  - `zoz_pro_device_credentials` (no direct client access; hashed tokens only)
  - `zoz_pro_device_jobs`
  - `zoz_pro_device_job_events`
  - `zoz_pro_device_pairing_challenges` (service-only)
  - `zoz_pro_android_app_projects`
  - `zoz_pro_android_app_builds`
- A device pairing challenge is 32 hexadecimal characters, expires in five minutes, and is atomically consumed once.
- Pair exchange creates a device-bound credential and a separate intake-only token scoped to the Hazem Ahmed channel. Only hashes are stored server-side.
- The current device-agent deployment version verified for this acceptance record is v32. Older version numbers below are historical release notes, not current deployment claims.
- Device credentials and intake tokens are stored in Android Keystore AES-GCM encrypted preferences.
- Owner can list/revoke devices and enqueue typed tasks from the current control center. Revocation also disables the device's associated intake source.
- The device-agent allow-list includes `device.health_check`, `device.ui_control`, `flow.generate_scene`, and `media.downloads.upload`; document intake registers `document.intake.upload` after storage finalization. The phone does not accept arbitrary code, shell commands, JavaScript, or raw tap coordinates.
- Device polling is scheduled with Android WorkManager at the platform minimum interval of 15 minutes and can also be triggered while the app is open. Android may defer background work due to Doze, battery optimization, or vendor policies.
- ZOZ agent v39 can queue up to six scene-specific Flow prompts for a recent saved draft to a paired device. The phone stores them as a durable local prompt queue, avoiding overwrite when more than one scene is waiting.
- The paired app can also execute a queued `media.downloads.upload` task: it scans only the public `Downloads` directory, selects the latest eligible complete document/video matching the task filters, verifies stability and SHA-256, and transfers the file through the private document or channel-scoped video intake path. Existing owner review and private-upload rules remain in force.

## Android app implementation
- Native Kotlin / Jetpack Compose project at `android/`, package `com.zozpro.flowbridge`.
- Persistent local scene prompt and SAF-selected media references.
- Open Google Flow via the signed-in browser, copy the prompt, and import generated clips.
- Local MP4 assembly uses Android `MediaExtractor` + `MediaMuxer` stream copy. It rejects incompatible audio/video track layouts, codecs, profiles, or dimensions instead of silently re-encoding. Source files are never overwritten.
- The owner chooses the output destination through Android's document picker.
- Final MP4 upload uses the existing private intake pipeline in 8 MiB chunks; metadata requires the user to select the kids/synthetic-media disclosures in the app.
- After intake, the file waits for owner review. Existing server worker can advance owner-approved uploads to YouTube privately; public publication remains a separate owner decision.

## Important boundaries / not implemented
- Google Flow has no confirmed authorized generation API/webhook in this project. The app currently opens Flow and hands off prompts; it does not autonomously press Generate, defeat quotas, bypass CAPTCHA/MFA, or claim unattended video generation.
- The device task poller is best-effort background work, not a 24/7 always-on daemon. Android owns scheduling and can defer work.
- Full local browser automation and Amazon KDP submission are not implemented. No KDP direct connector exists. KDP documents and metadata can be prepared by the existing content workflows, but account submissions and legal/financial declarations require owner action.
- No public YouTube publication, privacy changes, purchases, destructive actions, or account security changes are performed automatically.

## Validation status
- Android v0.8.3 / versionCode 28 build passed GitHub Actions run `42197568489` on 2026-11-06 (commit `5c301fa2296381fb1f82123e763e421083ca23fd`; artifact ID `13492612548`). The paired vivo V2342 reported the same installed app version.
- General repository CI has passed for the current feature branch commits.
- Production migrations were applied additively; device/credential/job schema and owner-read policies were verified. Service-only credentials/challenges have no client policy by design.
- Real-device pairing and document Downloads intake are verified. The backend recorded `downloads_access_registered` with `capability_enabled=true`; a 10,435-byte XLSX reached private intake; subsequent automatic Downloads jobs succeeded with the same SHA-256 and duplicate protection. The latest recorded heartbeat was 2026-11-06 22:24:47 UTC (2026-11-07 00:24:47 Cairo), so that historical audit does not assert the phone is online at every later moment.
- The automatic video Downloads branch is present in v0.8.3 but is not yet separately confirmed by a completed real-device video upload in the retrieved production logs. Real Flow clip assembly/playback and the full private YouTube upload path remain separate acceptance tests.

## Remaining acceptance work
1. Test stream-copy assembly with representative real Flow clips; verify audio, duration, order, and output playback.
2. Complete a separate real-device automatic Downloads-to-private-intake test for one video with its channel and synthetic-media disclosures.
3. Approve a private video intake asset and verify the existing YouTube private-upload pipeline. Public publication remains a separate owner decision.


## Release v0.3.0 — 2026-10-30

- Latest verified Android debug APK: v0.3.0, versionCode 3.
- GitHub Actions build: [run 41022918443](https://github.com/hazemnaw48-coder/zoz-pro-ai/actions/runs/41022918443), artifact `zoz-flow-bridge-debug-apk` (ID `12962297162`).
- APK SHA-256: `19fb654c4d91284d1e48375cd89b94f6000f8f097c1fa22c0209e68381b8b5a7`.
- App accepts one or multiple video files through Android Share intents and copies only app-owned working copies into private app storage. It provides owner-confirmed cleanup of those internal copies; original Gallery/Downloads files are not deleted.
- Production function versions: device agent v5, main agent v42, control v7, video intake v47. The video intake function has `verify_jwt=false` at the platform edge so scoped intake tokens can be used; all owner, device and intake-token actions are explicitly authenticated and owner/channel-scoped inside the function.
- The main agent queues up to six scene prompts from a recent script to a paired Android device. The phone persists them locally and retrieves jobs through WorkManager (15-minute minimum, best effort).
- After an owner approves the intake asset, the server can upload it privately. Once YouTube processing completes, the agent creates an `awaiting_owner_approval` task for public/unlisted release. The public-publish adapter executes only after that exact task is approved and the saved privacy target still matches; unapproved public publishing remains disabled.
- Google Flow mobile app is supported in Egypt. The official Flow Agent feature is currently web/PC only; the Android app can prepare prompts, open Flow, accept shared clips, assemble and upload them, but it cannot run Flow Agent autonomously or bypass its credit/identity checks.
- Physical-device acceptance tests still required: pair the owner's phone, verify heartbeat and prompt delivery, share real Flow clips, verify audio/order/duration after assembly, upload to intake, approve private upload, and approve the final publication task.
- Repository Edge Function source replaces the private owner email with the server environment variable `ZOZ_OWNER_EMAIL`. Set this server-only secret before redeploying those source files; never commit the real email or any OAuth/service-role tokens.
