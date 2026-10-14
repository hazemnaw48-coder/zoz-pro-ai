# Gemini / Google AI Studio execution brief — ZOZ Pro PR #14 closure

Use this only in Google AI Studio Build mode after importing the EXISTING GitHub repository. Do not create a new app.

## Exact scope

- Repository: `hazemnaw48-coder/zoz-pro-ai`
- Target work: PR #14 — `ZP-012: Vercel serverless runtime, private state and scheduled readiness check`
- Required branch: `feature/ZP-012-vercel-cloud-runtime`
- Current recorded handoff commit: `09b407b2202a1bd754edaaa73f410b2da98c8d13`
- Existing production baseline must remain unchanged: `f7ee581e0c1ab5b05af3b2e1cb91e8843254b474`
- Correct Vercel project ID: `prj_T6J2NwjPcGcOo6Zi4nW31EyS7YDc`
- Correct Vercel owner connection is the one labelled **ZOZ Pro**, associated with `hazemnaw48@gmail.com`.

## Absolute separation rules

This is ZOZ Pro only. Do not inspect, clone, change, deploy, or copy credentials from `zozaimanager2026-design/zoz-ai-control`, Railway ZOZ AI, Paperclip, Nivo, Floot's production-center project, or the other similarly named Vercel project. Never select a Vercel project by the name `zoz-pro-ai` alone; use the exact project ID and account above.

Do not create a replacement project. Do not merge PR #14, promote production, publish, run a paid job, send an external message, or modify account credentials. Preserve all existing owner-approval gates. Never print or copy secrets.

## What is verified already

- GitHub CI run #390 and PR CI run #391 for handoff commit `09b407b2202a1bd754edaaa73f410b2da98c8d13` both completed successfully.
- Vercel Preview deployment for the older PR #14 head was `READY`; the correct project's current latest deployment is on PR #15 and is also a Preview, not a confirmed production deployment.
- PR #14 remains open because a real owner-authenticated queue smoke test is required.
- During inspection the ZOZ Pro Vercel connector returned HTTP 403 for runtime logs, deployment events, environment-variable metadata, and protected-preview fetch. This indicates an access/authorization problem in the connector path; it is NOT proof that the application returns HTTP 404.
- A workflow already exists on the feature branch at `.github/workflows/protected-preview-smoke.yml`. It tests only the allowlisted read-only `system:health-check`, and checks the returned result, persistence, task verification status, queue executor heartbeat, and audit entries.
- The workflow requires two GitHub Actions secrets in environment `preview-smoke`: `VERCEL_AUTOMATION_BYPASS_SECRET` and `ZOZ_PRO_CONTROL_TOKEN`. It must never print values. The workflow file is currently not present on `main`; do not merge just to make it manually dispatchable.
- Last known Vercel environment inventory is stale: `ZOZ_CONTROL_TOKEN` and `BLOB_READ_WRITE_TOKEN` had been reported present, and `CRON_SECRET` missing at the earlier inspection. Re-verify names only through the correct project/account. Never reveal values.

## Required execution

1. Inspect the source, `README.md`, `docs/AI_STATE.md`, `docs/RUNTIME.md`, `package.json`, `api/queue/control-command.js`, the Vercel serverless entrypoint, state store, queue adapter, cron route and tests. Do not trust documentation over current code.
2. Run `npm test` and `npm run build` on the target branch. Read the full failures and fix only confirmed issues. Preserve production main and avoid broad rewrites.
3. Confirm the Vercel project and current Preview target using the exact project ID above. If authorization returns 403, stop protected API retries and report exactly which credential/scope needs the owner to reconnect. Do not switch to the generic Vercel connection and do not infer an application 404.
4. Verify required environment names/targets only, never values. If `CRON_SECRET` is still missing, give the owner the exact Vercel Settings → Environment Variables action; do not invent or transmit secret values.
5. Run the owner-authenticated protected Preview smoke using the already-defined workflow when the workflow can be securely triggered. If GitHub workflow dispatch is unavailable because this workflow is not on the default branch, do not merge to `main` just to bypass the gate. Report the specific blocker and the minimum owner action needed to run the smoke securely.
6. The smoke passes only if a fresh request reads back all of the following: the submitted health-check command is `completed`; the result includes the expected successful health-check marker; task `ZP-006` is in `verification`; `executor.mode` is `vercel_queue`; `executor.lastSeen` is present; `executor.lastCompletedCommandId` matches the new command; and matching claimed, heartbeat, and completion audit entries exist.
7. If a separate fresh-state read does not prove persistence, the queue worker does not complete, or the health endpoint fails, repair the minimal root cause and repeat tests. Never mark this complete on CI success alone.
8. Keep PR #14 open and production unchanged until the live smoke, persistence, current environment configuration, CI and preview checks all have evidence. Produce a final report with commit SHA, test/build results, Preview deployment URL and state, smoke run ID/results, remaining blockers, and links to the evidence.

## Expected final report

Use explicit status labels: VERIFIED, FAILED, BLOCKED, NOT TESTED. Separate CI verification from live runtime verification. Never claim production is live or fully closed without the required evidence. If access is still blocked, return a precise owner action rather than changing target accounts or guessing.
