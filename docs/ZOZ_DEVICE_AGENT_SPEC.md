# ZOZ Device Agent — implementation contract

## Goal
Turn an owner-controlled Android phone into an execution node for the existing ZOZ Pro agent without moving secrets or unrestricted remote-control privileges onto the device.

## Components
- Existing Supabase production agent remains the planner and durable business memory.
- Device app is a local executor, not an alternate owner identity.
- A device registry and job queue are additive backend resources; schema must be inspected and RLS reviewed before migration.
- Each device has a revocable, owner-scoped pairing grant. Pairing is initiated by the signed-in owner in the existing ZOZ Pro control center and confirmed on the phone.
- Device capabilities are advertised individually and can be disabled independently.

## Pairing protocol
1. Owner creates a short-lived one-time pairing challenge from an authenticated production session.
2. Phone scans or enters the challenge; it does not receive a service-role key.
3. Server binds the resulting device grant to the verified owner and selected project.
4. App stores a revocable device credential using Android Keystore-backed encryption.
5. Server issues narrowly scoped jobs only to the paired device.
6. Revocation invalidates future polling and capability grants; local app clears its credential.

## Job envelope
Every job has: job_id, owner_id, device_id, capability_id, payload_schema_version, created_at, expires_at, idempotency_key, approval_reference (nullable), and cancellation state.
The phone returns: accepted_at, started_at, finished_at, outcome, bounded result, evidence references, app_version, and error_code.
No arbitrary shell commands, arbitrary JavaScript, or arbitrary accessibility actions are accepted.

## Local queue
- Persist pending jobs in an encrypted local database.
- Use WorkManager for deferrable work and foreground service only for user-visible long-running work permitted by Android.
- Jobs must be idempotent or have explicit compensation behavior.
- Respect battery saver, network state, user cancellation, app standby, and Android background limits.
- Heartbeat is best-effort; missed heartbeats do not trigger unsafe retries.

## Capability model
Initial capabilities:
- open_approved_url
- copy_prompt_to_clipboard
- import_user_selected_media
- inspect_local_media_metadata
- prepare_upload_bundle
- launch_owner_approved_upload_flow
- report_device_health

Later capabilities require separate review:
- browser_page_read
- browser_form_fill
- local_video_remux
- private_youtube_upload

Never expose a general-purpose tap/click API. Browser operations are separate, origin-bound, and auditable.

## Security
- Never embed Supabase service_role, Google refresh tokens, Amazon credentials, or user passwords in the APK.
- Never upload browser cookies or local browser profile data.
- Use short-lived scoped grants, server-side owner checks, replay protection, and audit records.
- App data is private to the owner and can be locally cleared.
- User must be able to pause, revoke, inspect, and uninstall the device agent.

## Approval boundaries
Routine local file inspection, metadata extraction, prompt copying, build/test operations, and non-public drafts may be automatic.
New permissions, account linking, external submission, public publication, purchases, destructive actions, and legal/financial declarations require explicit owner approval.

## Acceptance tests
- Pair a device to one owner and verify another owner cannot see or dispatch to it.
- Expired/replayed pairing challenges are rejected.
- Revoked devices cannot poll or acknowledge new jobs.
- Job retries do not duplicate uploads or publications.
- Cancellation is acknowledged.
- Credentials never appear in logs, APK resources, or repository.
- App functions offline for local prompt and selected-file persistence.
- Device state and execution evidence are visible in the production control center.
