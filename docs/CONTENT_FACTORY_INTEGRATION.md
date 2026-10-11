# ZOZ Pro Content Factory integration (ZP-009)

## Scope and boundary

This adapter lives in `hazemnaw48-coder/zoz-pro-ai` on the isolated branch `feature/ZP-009-zoz-ai-capability-bridge`. It does not read, write, migrate, or deploy the legacy `zozaimanager2026-design/zoz-ai-control` repository. ZOZ Pro's state store, bearer token, tasks, approvals, and audit log remain separate.

The first concrete integration is a controlled production-to-publishing path:

1. A completed render is identified by the studio `jobId`.
2. ZOZ Pro creates a publication draft linked to a ZOZ Pro task.
3. The owner explicitly approves the associated `external_send` approval.
4. A second explicit submit action sends the video through Upload-Post.
5. ZOZ Pro stores the provider request ID and checks status until a YouTube URL is returned.

This is not a claim that Google AI Studio is live-connected to ZOZ Pro. The studio URL and its output route must be configured and reachable from Upload-Post before this adapter can publish.

## Server-side configuration

Set the following only in the ZOZ Pro runtime's server-side secrets/environment, not in source control or browser local storage:

- `UPLOAD_POST_API_KEY`: Upload-Post API key.
- `UPLOAD_POST_PROFILE`: exact profile name from Upload-Post `list_users`.
- `ZOZ_CONTENT_STUDIO_URL`: public HTTPS origin that serves `/outputs/<jobId>/video.mp4`.
- `ZOZ_PRO_PUBLISHING_ENABLED`: leave `false` until the account key, target profile, and public video URL have been verified.

Verified profile inventory at implementation time:

- `ZozAI` → YouTube `@zozai-q6z` (ZOZ Ai brand channel).
- `ZozAI2` → YouTube `@hazemelzoz7281` (Hazem Ahmed channel).

The adapter does not choose between these channels automatically. The configured profile determines the destination.

## API

All endpoints below require the existing ZOZ Pro bearer control token.

- `GET /api/content-factory/publisher/status`: configuration-only status; it never returns secret values.
- `POST /api/content-factory/publications`: creates a draft and a pending owner approval. Body fields: `taskId`, `jobId`, `title`, `description`, optional `hashtags`, optional `privacyStatus` (`unlisted` by default).
- `POST /api/approvals/:approvalId/approve`: owner approves the matching `external_send` request.
- `POST /api/content-factory/publications/:publicationId/submit`: only submits an approved publication, after checking the Upload-Post API credential.
- `GET /api/content-factory/publications/:publicationId`: retrieves and reconciles provider status when a request ID exists.

The browser Content Factory panel exposes the draft/approval flow and shows publication status. A queued response is not treated as successful publication; a verified YouTube post URL is required.

## Safety rules

- No secrets are committed or returned in API responses.
- No publishing is enabled by default.
- No upload is submitted without an explicit `external_send` approval and a separate submit action.
- Requests use a stable request ID; unknown network outcomes are marked for reconciliation instead of automatic resubmission.
- Publishing is external execution and must be tested first with an unlisted video.
- Never copy customer/contact databases or owner credentials between ZOZ AI and ZOZ Pro.

## Verification and remaining work

The isolated branch's GitHub Actions workflow runs `npm test` and `npm run build`. Passing CI validates the adapter and approval gates against mocked provider responses; it does not prove that production secrets are configured, the studio URL is reachable, or a real video has been published.

Next steps, in order:

1. Configure the server-side values in a private runtime.
2. Verify the Upload-Post credential and exact YouTube profile.
3. Verify that the chosen studio URL returns the actual final MP4 to the Upload-Post service.
4. Test one owner-approved unlisted publication and confirm the final YouTube URL.
5. Only then consider queueing or extending this adapter to additional channels and ZOZ AI business workflows.

No merge to `main` and no production deployment is included in this branch.
