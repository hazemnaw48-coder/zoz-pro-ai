# ZOZ Flow Bridge — current implementation record

## Objective
A native Android companion to the existing ZOZ Pro production project. It is an owner-bound execution device for narrowly scoped tasks, local video handling, and intake transfer.

## Production backend now deployed
- Project: `oxyzxbkwhafzaztraowc`.
- New Edge Function: `zoz-pro-device-agent`, ACTIVE v3, `verify_jwt=false` because it validates either the existing owner JWT or a one-time pairing code / hashed device token itself.
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
- Production function versions: `zoz-pro-device-agent` v5, `zoz-pro-agent` v39, `zoz-pro-agent-control` v6, `zoz-pro-youtube-analytics` v46.
- Device credentials and intake tokens are stored in Android Keystore AES-GCM encrypted preferences.
- Owner can list/revoke devices and enqueue typed tasks from the current control center. Revocation also disables the device's associated intake source.
- Job capabilities currently allow only `device.health_check`, `flow.open`, and `flow.copy_prompt`; the app does not accept arbitrary code, shell commands, JavaScript, or tap coordinates.
- Device polling is scheduled with Android WorkManager at the platform minimum interval of 15 minutes and can also be triggered while the app is open. Android may defer background work due to Doze, battery optimization, or vendor policies.
- ZOZ agent v39 can queue up to six scene-specific Flow prompts for a recent saved draft to a paired device. The phone stores them as a durable local prompt queue, avoiding overwrite when more than one scene is waiting.
- Upload capability is separate from the job queue: the paired app can transfer a completed MP4 through the existing resumable ZOZ intake API using its channel-scoped intake token. The asset enters `ready_for_review`; the existing ZOZ owner review and private-upload pipeline remains in force.

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
- Android debug APK build has succeeded previously for the earlier scaffold. A newer build containing device pairing, local assembly, and intake upload is currently being validated by GitHub Actions; do not distribute an APK until the matching latest workflow run is green and its artifact is verified.
- General repository CI has passed for the current feature branch commits.
- Production migrations were applied additively; device/credential/job schema and owner-read policies were verified. Service-only credentials/challenges have no client policy by design.
- Real-device pairing, file assembly across actual Flow samples, end-to-end upload, notification permission behavior, and 15-minute background execution still require a physical Android device test.

## Next steps
1. Verify latest APK build and install on the owner's Android phone.
2. Pair through the existing ZOZ Pro control center and validate heartbeat/job polling.
3. Test stream-copy assembly with real Flow clips; verify audio, duration, order, and output playback.
4. Upload a test output to intake, approve it, and confirm the existing private YouTube upload pipeline.
5. Only then extend approved device capabilities and evaluate a policy-compliant browser workflow for Flow/KDP.
