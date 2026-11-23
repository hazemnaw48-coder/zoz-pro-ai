# ZOZ Intelligence company integration contract

Status: Preview-only integration, 2026-11-23.

## Shared entry point
The Preview `zoz-pro-agent` exposes `POST {SUPABASE_URL}/functions/v1/zoz-pro-agent` with the existing owner Supabase Bearer session and publishable apikey:

```json
{"action":"intelligence_solve","request":"Describe the operational problem and desired outcome","department":"operations","agent":"zoz-pro-agent"}
```

Allowed department routing labels: `sales`, `marketing`, `operations`, `engineering`, `finance`, `research`.

The handler authenticates the existing confirmed ZOZ owner, delegates to `zoz-intelligence-engine` with `run_type=solve`, and returns the grounded research result plus a proposed task. This is a shared company entry point for authorized agents and department workflows; it is not yet a multi-tenant customer API.

## Mandatory lifecycle
1. Receive a problem and expected outcome.
2. Run current, source-grounded research; preserve source URLs and queries.
3. Diagnose root cause and compare feasible solutions, dependencies, risks and estimated costs.
4. Create a department-owned task with evidence, steps, permissions, approval state, idempotency key and verification method.
5. Require an explicit approval for external, sensitive, paid, publishing, messaging, or destructive actions.
6. Dispatch only to an enabled adapter with declared capability and least privilege.
7. Record acknowledgement separately from execution.
8. Verify destination read-back or provider receipt before setting `execution_status=verified`.
9. If no adapter exists, mark blocked and return the exact missing connector/permission; never pretend execution happened.

## Current Preview behavior
- `zoz-intelligence-engine` v3: grounded research, persisted run/events, task proposal, task listing, owner approval record.
- `zoz-intelligence-ui` v2: serves the HTML document as `text/html` and displays proposed tasks.
- `zoz-pro-agent` v18: shared `intelligence_solve` action delegates to the engine and returns the task proposal.
- The task approval endpoint records approval only. It does not enqueue a worker or execute an external action.
- Department adapters, task dispatcher, acknowledgements, cancellation/retry, and verified read-back are still pending.

## Security and release boundary
- All deployments described here target Preview project `vjnwojrqduoxhetutxrs` only.
- Production project `oxyzxbkwhafzaztraowc` and production agent are unchanged.
- The Edge Function uses `verify_jwt=false` only because it performs its own owner authentication via Supabase Auth; do not remove or bypass that check.
- Do not expose service-role/secret keys to browser clients.
- Before multi-company release, implement tenant-scoped authorization, membership roles, cross-tenant negative tests, and audit.
- Before production release, verify UI on mobile, authenticated end-to-end search, task creation/read-back, provider failure handling, and adapters in a controlled test.
