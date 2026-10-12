# ZOZ Pro ↔ Google AI Studio / Gemini file handoff (ZP-010)

## Role boundaries

- **Google AI Studio / Gemini**: create or revise content and project artifacts inside the existing Studio.
- **ZOZ Pro**: the independent control plane, owner approval log, private file inbox/outbox, and status dashboard.
- **Codex local executor**: execute explicitly queued low-risk code tasks in the configured ZOZ Pro checkout on the owner's computer. It reports heartbeats to ZOZ Pro while that computer/runtime is running.
- **Claude**: not used by this workflow. The scheduled Claude executor was removed from this isolated branch.
- **Legacy ZOZ AI, Nivo, Paperclip, and Floot**: out of scope; do not read, modify, migrate, or deploy them from this branch.

## File exchange API

All routes below require the ZOZ Pro owner bearer token. Never place the token in Google AI Studio client-side code, prompts, or a committed file.

- `GET /api/handoff` — list available private handoff files. Optional `?direction=from-gemini` or `?direction=to-gemini`.
- `POST /api/handoff` — upload a small file as JSON:
  `{"direction":"from-gemini","filename":"notes.md","contentBase64":"...","contentType":"text/markdown"}`.
  Inline payload limit: 3 MiB.
- `POST /api/handoff/import` — import a larger file from the configured Studio output origin:
  `{"direction":"from-gemini","filename":"video.mp4","sourceUrl":"https://<configured-studio-origin>/api/zoz-pro/outputs/<jobId>/video.mp4"}`.
  The URL must be HTTPS, match the exact configured Studio origin, and use the Studio’s token-protected `/api/zoz-pro/outputs/<jobId>/<filename>` route. Redirects are rejected. The Studio route requires a dedicated shared secret; do not use the owner control token. Maximum streamed file size: 100 MiB.
- `GET /api/handoff/file?pathname=<URL-encoded-pathname>` — download a previously listed file.

Direction meanings:
- `from-gemini`: deliver a Gemini/Google AI Studio output to ZOZ Pro.
- `to-gemini`: hand a file from ZOZ Pro back to the Studio workflow.

Files are stored in private Vercel Blob storage when running on Vercel; local mode uses the configured private data directory. File names are sanitized, extensions are allowlisted, downloads use attachment disposition and `nosniff`, and each accepted file receives a SHA-256 hash. File content is never exposed by the status endpoint.

## Configuration required for end-to-end transfer

Set `ZOZ_CONTENT_STUDIO_URL` only after identifying the actual deployed Google AI Studio/Content Studio origin that serves `/api/zoz-pro/outputs/<jobId>/<filename>`. Set `ZOZ_CONTENT_STUDIO_TOKEN` and `ZOZ_STUDIO_HANDOFF_TOKEN` to the same dedicated, high-entropy file-handoff secret configured in the Studio runtime as `ZOZ_PRO_HANDOFF_TOKEN`. This token may list/download only `to-gemini` files and import outputs from the configured Studio origin; it cannot access task state, approvals, or executor controls. Do not guess this URL. If the Studio currently exports files only to the browser's Downloads folder, this server-to-server import route cannot read that folder; use the small-file upload endpoint or first add a real authenticated Studio export endpoint.

The ZOZ Pro API is not yet evidence that Google AI Studio is connected. End-to-end file transfer must be tested against the real Studio deployment before the connector can be marked verified.

## Codex and shutdown behavior

Codex is the computer-side executor, not a cloud process. It only reports online and consumes queued tasks while its configured computer runtime is running. Vercel and the private file inbox can remain online after the computer is shut down, but they do not keep Codex executing local tasks. Do not claim full computer-independent execution until the relevant cloud work path has its own verified executor.

## Safety and release gates

- This is an isolated feature branch, not a production deployment.
- Do not merge to `main` or deploy without owner approval and passing CI.
- Do not enable external publishing or sending; it remains approval-gated.
- Never copy credentials or data from legacy ZOZ AI.
- Test build, tests, unauthorized access, private file persistence, and a real Studio round-trip before declaring the integration ready.
