# GEMINI EXECUTION BRIEF — ZOZ Pro Production Studio Closure
Date: 2026-10-14
Target system: **ZOZ Pro only**
Target repository: `hazemnaw48-coder/zoz-pro-ai`
Target Vercel project: `zoz-pro-ai` (project ID `prj_T6J2NwjPcGcOo6Zi4nW31EyS7YDc`)
Do NOT modify ZOZ AI, its apps, repo, Railway service, credentials, data, or publishing accounts.

## Mission
Continue the existing Google AI Studio application that the owner identifies as the **ZOZ Pro Production Studio**. Do not create a replacement app. Inspect the currently open Studio project, confirm its actual identity, existing render workflow, Google API usage, generated-file paths, and publishing flow. If the open app is actually a ZOZ AI app or its ownership cannot be established, stop before editing and report the ambiguity.

Close the actual production path, not only UI/docs:
- Generate real text/script, image and video outputs using supported Google AI Studio/Gemini capabilities.
- Preserve the existing Floot production-center UI as a source/creator. It should export artifacts to the ZOZ Pro handoff; it must not be rebuilt or made dependent on Floot's daily code-action quota.
- Receive generated assets from Floot/Qwen/other generators through explicit file import/export. Do not claim API automation where only manual file import is available.
- Send/receive files with the ZOZ Pro media intake API specified below.
- Keep the final social-media publishing step separate, with owner approval and a verified publisher account. Google AI Studio Build is not itself proof that a social platform post has been published.
- Finish one real end-to-end sample: script -> image/video generation -> exported MP4 -> handoff/import -> playback verification -> review queue. Do not publish publicly. A private/unlisted test is allowed only after owner approval and a confirmed destination account.

## Required system boundary
ZOZ Pro is separate from ZOZ AI. The only cross-system data flow allowed is an explicitly exported media artifact plus its limited manifest. Never transfer source code, API keys, access tokens, database snapshots, customer records, or internal memory. The manifest source value `zoz-ai-export` means only a file manually exported by the owner from ZOZ AI; it does not authorize a connector into the ZOZ AI backend.

## Current ZOZ Pro API contract (being prepared on isolated branch)
Branch: `feature/ZP-014-vercel-media-intake`.
Do not merge or deploy without owner approval. The branch contains a new media service and routes that require CI and review before use.

### ZOZ Pro owner-authenticated routes
Base URL is the verified deployment hostname of the ZOZ Pro Vercel project; do not assume an old Preview URL is current.
- `GET /api/content-factory/media/assets?limit=50` — list registered media assets.
- `POST /api/content-factory/media/upload-ticket` — JSON body: `originalFilename`, `sourceSystem`, optional `jobId`, optional `title`, optional `mediaRole`. Returns `assetId`, a private Blob `uploadUrl`, HTTP method `PUT`, expected `contentType`, maximum size, expiry and `completeEndpoint`.
- Client uploads the bytes directly to `uploadUrl` with `PUT` and the returned `Content-Type`. Never send the full video through the Vercel function body.
- `POST /api/content-factory/media/assets/{assetId}/complete` — verifies that the object exists in private storage and checks type/size before marking it `ready_for_import`.
- `GET /api/content-factory/media/assets/{assetId}/download-url` — returns a narrowly scoped temporary download URL.

Owner routes require `Authorization: Bearer <ZOZ_PRO_CONTROL_TOKEN>`. Never put this token into client-side source, a public URL, a prompt, or a GitHub file. It is not the Studio token.

### Dedicated Google AI Studio server-to-server routes
These require `Authorization: Bearer <ZOZ_PRO_STUDIO_INTEGRATION_TOKEN>`, a separate secret of at least 32 characters. Never reuse ZOZ AI, Floot, YouTube, or owner-control tokens.
- `GET /api/content-factory/studio/health`
- `GET /api/content-factory/studio/assets?limit=50`
- `GET /api/content-factory/studio/assets/{assetId}/download-url`
- `POST /api/content-factory/studio/assets/upload-ticket` — source is assigned server-side to `google-ai-studio` for assets produced by this Studio.
- `POST /api/content-factory/studio/assets/{assetId}/receipt` — acknowledge an imported asset only after downloading and validating its bytes. Body must include `studioAssetId`, `validated: true`, actual `contentType`, actual `sizeBytes`, and for video actual `durationSeconds`, `width`, `height`, `videoCodec`, `audioCodec` when available, and `checksumSha256` when calculated.
- The receipt is an import acknowledgement, not a publishing acknowledgement.

Important: These routes are source contracts and are not considered operational until branch CI, Blob configuration, a protected Preview handshake and a real file transfer pass. If a route returns 404/401/503 or differs from this contract, do not bypass auth or switch to the ZOZ AI backend. Report the exact response and stop safely.

## Google AI Studio work to perform
1. Confirm the active Studio project/app identity, Google account and whether it is the intended ZOZ Pro Studio. Record the app name/URL in the project's own notes, not in a public repo.
2. Inspect current source and preserve the current app/UI and any working generator. Make a checkpoint before editing.
3. Implement a **Media Handoff** panel:
   - list available ZOZ Pro media;
   - fetch the temporary download URL for an asset;
   - download the bytes to the Studio backend or user-selected import location;
   - verify MIME, nonzero size, SHA-256 and (for video) duration, dimensions and codec using available tools;
   - save the actual file in the Studio's durable storage or clearly identify if it remains browser-local;
   - submit the import receipt to ZOZ Pro only after checks pass;
   - display asset ID, source, size, status and import time.
4. Add reverse export for Studio-generated outputs:
   - select an actual generated file;
   - request an upload ticket;
   - PUT the bytes to the returned URL with the exact content type;
   - call the complete endpoint only after PUT succeeds;
   - list the returned asset in the ZOZ Pro Content Factory.
5. Use server-side secret storage/secret manager supported by this Studio runtime. Do not expose the integration token in browser JS, HTML, logs, screenshots, model prompts or URLs. If Build mode cannot keep a server secret or make server-to-server requests, stop and report that capability limitation; do not hardcode the token.
6. Add retry-safe transfer IDs, visible failure messages and audit information. Never report transfer success based only on a queued request.
7. Complete a real short generation test with actual output bytes, not a placeholder, static slide, or synthetic success object. Confirm mobile playback of the exported MP4. Preserve the original file and record its actual metadata.
8. Keep all external publishing disabled during this task. Do not connect or change a YouTube/social account, do not publish a public post, do not purchase credits or upgrade services.

## Actual video acceptance checks
- Real moving video (not a slideshow substitute) generated through the supported generator.
- MP4 container, H.264 video, `yuv420p`, 1080x1920 portrait 9:16 at 30 fps where supported; AAC audio, 48 kHz stereo when the generated audio supports it. Record actual properties rather than claiming unsupported settings.
- Duration and stream metadata verified with ffprobe or an equivalent reliable media probe.
- Thumbnail, SRT/VTT captions and JSON manifest exported when available.
- Upload/download checksums match. Private storage persists after a new session.
- The file opens and plays on the owner's phone.
- Transfer receipt and audit record match the real file.
- A UI state labelled "generated/imported/published" must reflect evidence from the real provider and real artifact. Never fabricate a job ID, post URL, successful export or completed generation.

## Report back with evidence
Return a compact closure report:
- exact Studio app/project identity confirmed;
- files/routes changed;
- actual generator/model used and real job IDs;
- exported filename, bytes, duration, resolution, codecs and checksum;
- transfer/receipt status and actual storage durability;
- phone playback result (owner confirmation required if you cannot access the phone);
- any remaining blocker and exact next owner action.
If any test fails, preserve the current project and artifacts, make no public deployment, and report the exact failing step.
