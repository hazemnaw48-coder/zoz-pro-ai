# ZOZ Pro

Independent Business Operating System. This repository does not depend on the legacy ZOZ AI project.

## Deployment target
- Vercel serverless functions for the web/API runtime.
- Private Vercel Blob for durable state (`BLOB_READ_WRITE_TOKEN`).
- Vercel Cron for a daily cloud readiness check.
- Local JSON persistence is for local development only; serverless deployment deliberately fails closed if Blob credentials are missing.

## Required Vercel configuration
1. Link the Vercel project to `hazemnaw48-coder/zoz-pro-ai`.
2. Set `ZOZ_CONTROL_TOKEN` as a strong secret in Production and Preview.
3. Create a private Vercel Blob store and set its `BLOB_READ_WRITE_TOKEN` in Production and Preview.
4. Set `CRON_SECRET` as a sensitive Production environment variable. The scheduled endpoint deliberately returns 401 when the secret is missing or incorrect.
5. Set required Content Factory secrets only after verifying the destination account and publishing settings. Keep `ZOZ_PRO_PUBLISHING_ENABLED=false` until an explicit owner approval is in place.
6. Deploy the `feature/ZP-012-vercel-cloud-runtime` branch to Preview first; verify health, owner authentication, state persistence across separate function invocations, and cron authentication before promoting to Production.

## Important runtime boundary
Vercel Cron invokes a short-lived function; it does not keep a Codex computer executor alive. The scheduled heartbeat in this branch is a readiness/persistence check only. It does not claim to execute queued Codex commands. A fully autonomous command worker must run on an always-on managed worker or durable task runtime and authenticate to the control API. Do not report autonomous execution as enabled until that worker has passed an end-to-end test.

## Safety
- Financial and external actions must retain explicit owner approval.
- Do not send messages, publish content, spend funds, or change external accounts without the relevant approved action.
- Do not copy secrets into GitHub, source files, logs, or browser storage.
- Never silently fall back to ephemeral local files in Vercel.
