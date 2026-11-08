# ZOZ Video Factory — Android local media pipeline

## Goal
Turn Flow and other user-generated clips into a reviewed final asset without routing every byte through a third-party automation service.

## Pipeline
1. Import clips through Android's system file picker or share sheet.
2. Persist URI permissions and a manifest containing source name, size, duration, codec, resolution, frame rate, audio streams, and checksum.
3. Validate required clips, order, and media compatibility.
4. Prefer stream-copy remux/concatenation only when codec, profile, dimensions, timebase, and stream layouts are compatible.
5. If compatibility requires transcoding, show the expected output settings and require the owner to accept quality changes.
6. Preserve original audio by default; do not add music, titles, logos, watermarks, or outro.
7. Produce a new output file; never overwrite source clips.
8. Run integrity checks and generate a processing report.
9. Upload only through the existing authenticated ZOZ intake endpoint, with resumable transfer and idempotency.
10. Keep the original inputs until the owner confirms the final asset is safely stored.

## Android implementation
- Media metadata: MediaExtractor / MediaMetadataRetriever.
- Compatible remux: MediaExtractor + MediaMuxer, with codec/track compatibility checks.
- Transcoding fallback: AndroidX Media3 Transformer, explicitly marked as a re-encode.
- Large files: streaming/chunked I/O; do not load entire videos into memory.
- Background processing: WorkManager for deferrable tasks; foreground service for visible long-running jobs where Android policy permits.

## Quality policy
- Never claim "original quality preserved" unless the path used stream copy and output metadata/bitrate checks support that claim.
- Do not silently transcode.
- Preserve source order exactly as specified by the owner.
- Do not remove audio tracks or alter frame rate without explicit setting.
- Failed jobs retain inputs and a diagnostic report.

## Upload policy
- Upload endpoint and token scope must be verified from the production implementation before wiring the app.
- No service-role key or long-lived upload token in the APK.
- Use short-lived owner-scoped upload authorization.
- Upload remains private/unlisted until owner review; public publish is a separate approval action.

## Acceptance tests
- Same-codec clips remux with audio/video tracks intact.
- Incompatible clips are rejected or routed to a clearly labelled transcode flow.
- Source checksums remain unchanged.
- Output can be decoded and duration/order are correct.
- Interrupted upload resumes without duplicate intake records.
- Owner can cancel and inspect progress.


## 2026-11-08 workflow decision — external generation, single publishing path
- Do not treat unattended Google Flow Android control as a prerequisite or as a completed capability. The current Flow accessibility bridge did not pass real-device UI-tree acceptance; it must not trigger paid generation attempts.
- Create prompts and scene plans in the production workbench, then execute them in a video-generation tool the owner can operate directly from the phone. Tool choice is metadata only; ZOZ does not claim to launch, control, or press Generate in that external app.
- Export/assemble one final video with its intended audio. Keep the source files unchanged. Do not create a second upload route from the production workbench.
- The only channel-publishing intake is the main ZOZ Pro Production Center: choose the correct active channel, review title/description/tags and synthetic-media / made-for-kids disclosures, upload the final file once, wait for private YouTube upload and processing, review it, then require owner approval before Public/Unlisted visibility changes. Verify the video in the public channel feed before recording Published.
