# ZOZ Pro Android Flow Bridge — implementation brief

Status: architecture approved for implementation; no Android APK or Flow automation is claimed to exist yet.
Repository: `hazemnaw48-coder/zoz-pro-ai`
Feature branch: `feature/zoz-android-flow-bridge`
Production backend: Supabase project `oxyzxbkwhafzaztraowc`

## Product goal

Build a companion Android application that lets the existing ZOZ Pro owner agent prepare and manage video-production jobs from the phone, hand the prepared scene prompts to the already-used Google Flow sessions on that same phone, receive exported clips, assemble a finished video locally, and return the result to the existing ZOZ Pro intake flow.

Preserve the existing ZOZ Pro web control center, production database, YouTube authorizations, existing upload path, and the three Google Flow accounts. Do not rebuild or replace them.

## Important integration truth

The three Flow accounts being listed/connected in ZOZ Pro does not by itself prove that Flow exposes a supported server API or that ZOZ has a reusable Google OAuth grant for Flow. The existing Supabase function `zoz-pro-ai-video-studio` v5 is a separate experimental generator: it calls a public Hugging Face LTX Space for a single six-second clip and Gemini TTS for narration. It is not Google Flow control, not a multi-scene renderer, and its free shared GPU queue is not a production guarantee.

The Android bridge must reuse the Flow sessions already signed in on the owner's phone. Never ask the owner to paste Google passwords, cookies, browser storage, access tokens, or API keys into the app.

## Android bridge capability boundaries

### Supported foundation
- Native Android app, phone-first Arabic interface.
- Secure owner sign-in to the existing Supabase Production project.
- Durable local job queue with visible states, retries, timestamps, and audit events.
- Receive a production package from the existing ZOZ Pro agent: channel, topic, script, scene order, individual prompts, aspect ratio, durations, quality constraints, and account-selection hint.
- Open the installed Flow app or its official web experience using Android intents/deep links where supported; copy/share one scene prompt at a time.
- Let the owner choose which of the already signed-in Flow accounts to use; never silently switch accounts.
- Import generated MP4 clips using Android's Storage Access Framework picker; preserve originals and record checksums/metadata.
- Validate clip count, order, dimensions, duration, audio presence, and file size.
- Assemble clips on-device with a pinned, maintained media library; keep source clips unchanged and retain original audio by default. Render a new output file; do not claim bit-for-bit preservation after concatenation.
- Upload the final MP4 to the existing ZOZ Pro video-intake API using a short-lived, owner-authorized integration grant or an authenticated owner-session flow. Do not embed service-role keys or long-lived intake tokens in the APK.
- Hand off to the existing owner-review/private-upload workflow. Public publishing remains disabled unless separately enabled by the owner.

### Optional UI automation — separate gated milestone
A transparent Android AccessibilityService may be evaluated only if Flow's terms and Android policy permit the exact use. It must be opt-in, visibly enabled by the owner, limited to the Flow app/package and explicitly enumerated UI actions, and immediately stoppable. It must not bypass CAPTCHA, account security, consent screens, quotas, payment prompts, or other protections. No hidden background control, credential scraping, or arbitrary screen tapping.

Until policy and on-device tests confirm this, the bridge is an assisted workflow: it opens Flow and prepares prompts, while the owner taps Generate and exports the resulting clip. Do not describe this as full autonomous Flow control.

## End-to-end stages and acceptance evidence

1. **Pairing:** owner signs in; app confirms production project and owner identity without exposing secrets.
2. **Job receipt:** a real job created by the ZOZ agent appears on the phone with a stable ID and exact ordered scenes.
3. **Flow handoff:** opening Flow and transferring a prompt works for each scene; selected account remains under owner control.
4. **Clip receipt:** owner imports each generated MP4; app verifies and stores it in the correct job/scene order.
5. **Assembly:** app renders one playable output with expected aspect ratio, duration, ordered scenes, and native audio policy.
6. **Return to ZOZ:** completed MP4 reaches the existing intake queue and appears as `ready_for_review`.
7. **YouTube handoff:** existing ZOZ Pro approval path can upload privately; no automatic public publication.
8. **Recovery:** app survives process death/reboot without losing the job ledger; failed transfers can resume safely.

A stage is complete only after a real device test and a saved evidence record. CI/build success alone does not prove Flow automation or video production.

## Free-only and privacy constraints

- No paid Google Cloud activation, no billing enablement, no paid video API, no paid hosting, and no subscription purchase.
- Use only quotas/credits already available to the owner's current Flow accounts; show quota/plan blocks honestly.
- No account rotation designed to evade quota limits or service restrictions.
- No new secrets in GitHub, APK resources, local logs, or client-visible JavaScript.
- No public upload, privacy edit, metadata edit, delete, or archive without explicit owner approval.
- Avoid sending private video bytes through third-party rendering services. Prefer on-device assembly.
- Do not silently upload raw Flow clips to public hosting.

## Implementation phases

A. Inspect current Android tooling, repository build conventions, Supabase auth and existing intake API; record exact API contract and security boundary.

B. Add Android project and GitHub Actions APK build on this feature branch. First deliver a minimal installable companion shell with production-safe owner sign-in and health check.

C. Add agent-to-phone job queue and durable job/scene state using a narrowly scoped backend contract and owner-scoped RLS. Do not modify existing tables until schema is inspected; prefer additive migration/table.

D. Add assisted Flow handoff, clip import, validation, local assembly, and resumable upload to existing intake.

E. Only after policy review and real-device validation, consider a constrained AccessibilityService. Keep assisted manual mode working if automation is unsupported.

## Current known backend facts

- Existing Production Supabase project: `oxyzxbkwhafzaztraowc`.
- Existing owner agent: `zoz-pro-agent` v32.
- Existing manager control: `zoz-pro-agent-control` v5.
- Existing video intake endpoint: `zoz-pro-youtube-analytics` (current production function version must be checked before relying on it).
- Existing experimental studio: `zoz-pro-ai-video-studio` v5; Hugging Face LTX single-clip experiment, not Flow.
- Existing production upload/publish permissions remain as-is. The phone bridge must not weaken them.

## First engineering action

Inspect the existing app's Android/browser entry points and the exact intake API implementation. Then create the smallest native Android project and CI APK artifact on this branch. Do not deploy backend changes or change production policy as part of the initial scaffold.
