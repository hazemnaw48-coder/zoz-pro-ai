# ZOZ Pro

Independent Business Operating System. This repository does not depend on the legacy ZOZ AI project.

## Cloud runtime

- Vercel Functions serve the control interface and authenticated API.
- Private Vercel Blob is the durable state store. Hosted execution fails closed if `BLOB_READ_WRITE_TOKEN` is unavailable; there is no ephemeral file fallback.
- Vercel Queues dispatches allowlisted safe commands to an event-driven cloud worker. The worker claims the task, persists its result and audit activity, and moves the task to `verification`; task completion still requires the existing owner verification checks.
- Vercel Cron at `/api/cron/heartbeat` is a readiness check only, not a persistent worker.
- The local Codex CLI executor remains a development/engineering path. It is not the cloud worker and keeping a computer online is not required for the allowlisted cloud tasks.

## Supported cloud tasks

The generic cloud worker is deliberately restricted to these read-only commands:

- `system:health-check`
- `system:project-summary`
- `gemini:assist:<your text task>` for drafting, writing, summarization, planning and text analysis through the Gemini API.

For example: `gemini:assist: اكتب سكربت فيديو مدته دقيقة للأطفال عن القمر مع تقسيم المشاهد`. The Gemini path returns text to the task record; it does not run code or call external tools. Financial, destructive, publishing, messaging, credential/account and other external actions are never executed. Approval records remain explicit; owner approval alone does not give this text-only worker a risky-action handler.

## Required Vercel configuration

1. Link the Vercel project to `hazemnaw48-coder/zoz-pro-ai` (the ZOZ Pro account's existing project).
2. Set `ZOZ_CONTROL_TOKEN` as a sensitive secret in Production and Preview.
3. Create/use a private Vercel Blob store and set `BLOB_READ_WRITE_TOKEN` in Production and Preview.
4. To enable Gemini text tasks, set `GEMINI_API_KEY` as a sensitive server-side environment variable for the intended environment. Optionally set `GEMINI_MODEL` to a model ID available to that API key. Never expose either variable in the browser or repository.
4. Set `CRON_SECRET` as a sensitive Production environment variable (and Preview if checking the Preview cron endpoint). The readiness endpoint fails closed with HTTP 401 when it is missing or incorrect.
5. Do not set external publishing/integration secrets or enable sending as part of the cloud-worker smoke test.
6. Verify the latest Preview with a non-destructive `system:health-check`, then inspect the command result, worker heartbeat, audit trail and persisted state across a separate request before considering production promotion.

## Delivery and persistence

- Queue delivery is at-least-once. Command claiming/completion is idempotent for these read-only operations; stale Blob ETag write conflicts propagate to the queue for retry rather than overwriting newer state.
- `api/queue/control-command.js` is invoked by the Vercel Queue trigger; it is not a public polling daemon.
- Never copy secrets into GitHub, source files, client storage, logs, or test output.
- Preserve the existing production deployment until the live smoke test, durable-state verification, required configuration check and current CI/Preview verification all pass.

## Existing owner approval rules

Financial and external actions require explicit owner approval. The cloud worker adds a stricter execution boundary: it never sends messages, publishes content, spends funds, alters external accounts, performs destructive actions or executes arbitrary shell/Codex instructions.
