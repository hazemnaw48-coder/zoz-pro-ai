# ZOZ Pro — Durable Engineering Handoff

Resume from this file and Git history; do not rebuild completed work or mix this repository with the legacy ZOZ AI system.

## Project boundary

- Project: ZOZ Pro — independent Business OS
- Repository: `hazemnaw48-coder/zoz-pro-ai`
- Active task: ZP-012 — Vercel cloud runtime, durable state, and safe event-driven command worker
- Active branch: `feature/ZP-012-vercel-cloud-runtime`
- Baseline commit reviewed for this change: `8ebee6046b36a8100c57f9f8ce9d7dab354b70ea`
- Excluded repository: `zozaimanager2026-design/zoz-ai-control`
- Do not use another similarly named Vercel project or account.

## Runtime architecture

Phone control interface -> authenticated `POST /api/control/commands` -> private Vercel Blob state -> Vercel Queue topic `zoz-pro-control-commands` -> event-driven `api/queue/control-command.js` consumer -> durable command/task updates, result, worker heartbeat and audit activity.

Vercel Cron is a daily readiness/persistence check only. It is not an always-on worker. The local Codex CLI executor and Windows/Tailscale launcher remain separate local engineering tools; they are not the cloud execution path.

## Safe cloud-worker boundary

Supported read-only commands:
- `system:health-check`
- `system:project-summary`

The worker uses an explicit allowlist; it does not run arbitrary shell or Codex CLI instructions. It will not execute financial, destructive, publishing, messaging, credential/account or other external actions. Owner approval records remain intact; the read-only worker blocks approved risky commands that have no dedicated action handler. Task-level completion remains gated by the existing verification checks.

## Storage and retries

- Hosted runtime requires private Blob storage; it must fail closed when `BLOB_READ_WRITE_TOKEN` is missing.
- Cloud queue delivery is at-least-once. The deterministic read-only worker can resume a persisted claim after a retry; completed commands are idempotently skipped.
- Blob ETag/precondition conflicts must be returned as retryable conflicts; never overwrite newer state using a stale write.
- Do not read or print secret values.

## Required environment configuration

Environment names only were inspected for the correct ZOZ Pro Vercel project:
- `ZOZ_CONTROL_TOKEN`: present for Production, Preview and Development.
- `BLOB_READ_WRITE_TOKEN`: present for Production, Preview and Development.
- `CRON_SECRET`: missing at last inspection (2026-10-13). The owner must add it as a sensitive Production variable; add Preview too if testing the Preview Cron route.
The secret values were not read. Variable presence alone does not prove that credentials are valid.

## Verification boundary

- Before this change, CI run `38322330120` (run #292) passed `npm test`, `npm run build` and the Windows launcher checks for baseline commit `8ebee6046b36a8100c57f9f8ce9d7dab354b70ea`.
- Do not treat that baseline CI as verification for the new queue worker. Check the latest GitHub Actions run for the code commit and the follow-up handoff commit before reporting full success.
- Regression coverage exercises the real control API with a test token, claims a safe command, records its result/heartbeat/audit, then verifies persistence through a new request and new store instance.
- No live mobile Preview smoke is confirmed until the owner submits `system:health-check` from the Preview control interface and the resulting command, heartbeat, audit and persistence are read back.
- No merge, production promotion, external send, publishing, financial action or account/secret mutation is authorized while the live smoke/configuration gates remain incomplete.

## Production boundary

Keep the existing production deployment (commit `f7ee581e0c1ab5b05af3b2e1cb91e8843254b474`; deployment `dpl_CJpkqbhELpqJcWDZw2mMJGGxyqff`) intact until all required gates pass. Current Preview deployment for the baseline head was `dpl_CzC9arEVNhTv92UWEn2ZuNCjPmbf`; re-check the latest deployment after each commit.

## Next actions

1. Verify CI for the code commit; resolve all failures and inspect the latest Codex review.
2. Verify the new Preview deployment and safe event-driven queue path without external side effects.
3. Owner adds the missing `CRON_SECRET` in the correct Vercel project without sharing the value.
4. Owner performs the actual authenticated Preview smoke through the mobile UI, refreshes state in a separate request, and checks command ID, worker status/heartbeat, result and audit event.
5. Merge/promote only after those live gates have verified evidence.

## ZP-012 current handoff — 2026-10-13

- Current head at this checkpoint: `19c820f8c1b9c96a8f82ab3d3aca3b6db40b3a9c`.
- The Blob state reader now requests `useCache: false` for mutable state, so separate worker invocations do not read a stale cached snapshot.
- The Tasks view exposes an explicit Assign to Codex action for planned tasks before a cloud diagnostic can be queued.
- CI passed for the current head and its Vercel Preview deployment is Ready. Existing production remains on `f7ee581e0c1ab5b05af3b2e1cb91e8843254b474`; do not merge or promote based on CI alone.
- GitHub review connector is available. The last Codex review attempt could not run because its review usage limit was reached; do not repeat until it resets.
- The remaining gate is a live, owner-authenticated Preview smoke: assign `ZP-006` if still planned, submit `system:health-check`, refresh state in a separate request, and verify command completion, task status `verification`, persisted result, executor heartbeat/mode, and corresponding audit entries.
- Current Vercel connector access returns `403` for deployment inspection, runtime logs, and environment metadata; this is an access limitation, not evidence that the app itself returns an error.
- The daily readiness cron is not the command worker. The queue worker only allows `system:health-check` and `system:project-summary`; it cannot run arbitrary shell/Codex instructions or external/financial actions.
