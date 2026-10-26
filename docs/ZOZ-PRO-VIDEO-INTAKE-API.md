# ZOZ Pro — Video Intake API for Approved Production Centers

This API is for sending finished MP4/MOV/WebM/MKV videos into the ZOZ Pro production queue for the configured YouTube channel. It does not grant publishing rights to a production center.

## Base URL

`https://oxyzxbkwhafzaztraowc.supabase.co/functions/v1/zoz-pro-youtube-analytics`

Every request is `POST` with JSON unless uploading bytes to the signed Storage URL. Use the `x-zoz-intake-token: <token>` header for a production-center integration. Create a separate token per center in the ZOZ Pro “استقبال الفيديوهات” page. The token is shown once; store it only in that center's private server-side settings. Do not put it in a public client, browser bundle, or GitHub repository.

## Upload flow

1. `POST ?action=intake_create`
   JSON example:
   ```json
   {
     "filename": "ancient-egypt-short.mp4",
     "total_bytes": 18200000,
     "content_type": "video/mp4",
     "title": "عنوان الفيديو",
     "description": "وصف الفيديو",
     "tags": ["مصر القديمة", "التاريخ"],
     "made_for_kids": false,
     "contains_synthetic_media": true,
     "target_privacy_status": "public"
   }
   ```
   `made_for_kids` and `contains_synthetic_media` must be explicit booleans before owner approval. `target_privacy_status` can be `public` or `unlisted`; upload to YouTube is always private first.

2. Read `asset.id`, `asset.chunk_size` and `asset.chunk_count` from the response. Chunk size is 8 MiB. The current intake guardrail caps one video at 850 MiB; actual availability still depends on the project's remaining Storage quota.

3. For every zero-based part index, in ascending order:
   - `POST ?action=intake_signed_part` with `{"asset_id":"...","part_index":0}`.
   - Upload the bytes for that part to the returned `upload_url` with `POST`, `Content-Type: application/octet-stream`, and the raw binary body. Do not send the integration token to the signed URL.
   - `POST ?action=intake_part_done` with the same `asset_id` and `part_index`. The server verifies that the stored object exists and has the expected byte length.
   - Retry safely if needed; the same part path may be overwritten by a newly signed upload URL.

4. `POST ?action=intake_finalize` with `{"asset_id":"..."}`. The server rejects incomplete uploads. A successful file becomes `ready_for_review`.

## Authentication and permissions

All integration requests use the header `x-zoz-intake-token`. The API also requires an approved active source token. A source token may call only `intake_create`, `intake_signed_part`, `intake_part_done`, and `intake_finalize`. It cannot read the owner queue, approve/reject, upload to YouTube, publish, or archive. Revoke a token in ZOZ Pro if a center no longer needs access.

The owner uses the normal ZOZ Pro sign-in for the private queue and later steps.

## Owner-controlled lifecycle

`ready_for_review` → owner approves → `approved` → upload to YouTube as `private` → `processing` → poll `intake_check_processing` until `ready_to_publish` → owner explicitly confirms `intake_publish` → `published` → owner confirms `intake_archive` to delete temporary parts while retaining the audit metadata and YouTube video ID.

Owner actions use the normal owner session and the same JSON POST endpoint. Examples:
- `intake_list` — list intake queue
- `intake_review` — `{"asset_id":"...","decision":"approve"}` or `decision:"reject"`
- `intake_start_youtube` — `{"asset_id":"..."}`
- `intake_youtube_part` — `{"asset_id":"...","part_index":0}`, sequentially until `complete:true`
- `intake_check_processing` — `{"asset_id":"..."}`
- `intake_publish` — requires `{"asset_id":"...","publish_confirmed":true}`
- `intake_archive` — `{"asset_id":"..."}`
- `intake_source_list`, `intake_source_create`, `intake_source_revoke` — owner-only integration management

## Integration caveat

This generic API works for any production center that can make authenticated HTTP requests or use a small private bridge/automation. It does not magically add an export button inside third-party services that lack webhook/API support; those services need their own supported integration, automation, or manual file export followed by phone upload in ZOZ Pro.
