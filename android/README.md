# ZOZ Flow Bridge — Android companion (0.8.3)

The Android companion is paired to the production ZOZ Pro Supabase project and runs as an owner-bound execution device.

## File intake

- Automatic file tasks are dispatched from the production device-agent queue; the phone does not open a picker for queued tasks.
- The file scanner is restricted to the public Downloads directory (maximum traversal depth 3) and to extensions explicitly allowed by the task: documents (csv, xlsx, xls, pdf, txt, docx, png, jpg, jpeg, webp) or videos (mp4, mov, webm, mkv).
- Partial download suffixes are ignored. The candidate must be within the permitted size range, match the task filters, and remain unchanged during the stability check.
- SHA-256 is used for duplicate detection. Repeated commands for the same content return the prior intake reference instead of uploading a duplicate.
- Documents are stored in the private zoz-pro-documents bucket. Videos use the existing channel-scoped private video-intake path and remain pending review. No public publishing occurs from this intake operation.
- Android all-files-access permission is checked before scanning. The backend grants the media.downloads.upload device capability only after the app reports the permission as granted.
- An explicit Android document picker remains available as a fallback/manual intake path.

## Device and safety boundaries

- The device credential and intake token are held in Android Keystore-protected storage.
- The device polls typed, allow-listed jobs. It does not accept arbitrary shell commands, source code, tap coordinates, or general phone control.
- A video intake task must include the approved channel and the required made_for_kids and contains_synthetic_media disclosures.
- The public publishing flow remains separate and owner-approval gated.
- Background execution is best-effort. Android Doze, vendor battery controls, network loss, or an offline phone can defer queue processing; the device must be powered on and connected for local Downloads scanning.

## Production verification record — 2026-11-07

- Android build run 42197568489 completed successfully for v0.8.3 / versionCode 28; artifact ID 13492612548.
- The paired vivo V2342 reported app version 0.8.3, device_status=active, and capabilities media.downloads.upload and document.intake.upload.
- The backend audit recorded downloads_access_registered with capability_enabled=true.
- A 10,435-byte XLSX document was finalized in private intake. Subsequent queued Downloads jobs succeeded and returned the same SHA-256 as a duplicate, confirming scan-before-deduplicate behavior without duplicate storage uploads.
- The video automatic path is present in this release but has not been separately proven by a completed real-device video Downloads upload in the retrieved production records.
- Latest recorded device heartbeat at verification: 2026-11-06 22:24:47 UTC (2026-11-07 00:24:47 Cairo). This is an audit timestamp, not a promise of present online connectivity.

Google Flow scene generation still requires the user to perform the authorized actions in Flow. The companion prepares prompts, accepts completed clips, and handles local assembly/intake; it does not bypass Flow quotas, CAPTCHA, MFA, or account controls.