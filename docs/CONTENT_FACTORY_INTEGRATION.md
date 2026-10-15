# ZOZ Pro — Independent Content & Media Workflow (ZP-014)

## Current owner decision

The existing Google AI Studio production center is **out of scope and disconnected** until it is repaired or the owner accepts a working replacement. Do not configure a Studio endpoint, use a Studio token, call a Studio-specific route, or edit that Studio app/repository.

This branch implements a provider-neutral **manual file intake**. It does not automatically generate video and does not prove that a file can be exported from any generator. Open the external tool, create and download the actual artifact, then import it into ZOZ Pro.

## Independent generator catalog

- TAAFT Video Generator: `https://theresanaiforthat.com/@taaft/video-generator/?ref=header`
- Qwen: `https://qwen.ai/home`
- Digen AI: `https://digen.ai/app/`

These links launch independent websites. No API call, credential transfer, recurring job or payment action is configured by the catalog.

## Media intake workflow

1. Open an external generator and create/download the actual MP4, image, audio or caption file.
2. Return to ZOZ Pro Content Factory, choose the source label and select the downloaded file.
3. ZOZ Pro creates a short-lived signed upload ticket; the browser sends the bytes directly to private Blob storage and then calls the generic completion route.
4. The server verifies the stored object, media type and size, and records a manifest with status `ready_for_import`.
5. Request a temporary download URL and verify the real file plays on the phone. A manifest or successful build alone is not acceptance evidence.

Supported formats: MP4/MOV/WebM video, MP3/M4A/WAV audio, PNG/JPG/WEBP images, SRT/VTT/TXT captions and JSON/TXT manifests. Video limit: 250 MB; other supported files: 25 MB. Upload URLs expire after 15 minutes; download URLs expire after 5 minutes.

## Owner-authenticated API routes

- `GET /api/content-factory/media/assets?limit=50`
- `POST /api/content-factory/media/upload-ticket`
- `POST /api/content-factory/media/assets/{assetId}/complete`
- `GET /api/content-factory/media/assets/{assetId}/download-url`
- `GET /api/content-factory/status`
- `GET /api/content-factory/publisher/status`

The former `/api/content-factory/studio/*` route family and dedicated Studio-token namespace are removed from this branch. Media routes use the existing ZOZ Pro owner-control bearer token; never place it in browser source, URL parameters, prompts or Git.

## Publishing and export safety

Publishing remains unavailable until the owner selects a separate media center and its real file-delivery path is verified. The server requires `ZOZ_PRO_MEDIA_CENTER_SELECTED=true` even to create a publication draft. A future submission also requires publisher credentials, `ZOZ_PRO_PUBLISHING_ENABLED=true`, a verified HTTPS output origin, a matching owner-approved `external_send` action, and a real test against the chosen center. Do not set the selection flag to bypass this gate.

## Safety and acceptance

- Do not read/copy credentials or runtime state from `zozaimanager2026-design/zoz-ai-control`.
- A configured environment variable is not proof of a working integration.
- Do not merge or deploy this branch without explicit owner approval.
- Required evidence: actual uploaded file type/size, manifest/asset ID, successful temporary download, phone playback and recorded errors if any.
