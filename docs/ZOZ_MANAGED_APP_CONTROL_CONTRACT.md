# ZOZ Managed App Control Contract

## Product rule

Every application produced by the ZOZ factory is a managed product of ZOZ. The customer uses the customer-facing application; ZOZ operators and authorized agents manage the product through the ZOZ Pro control plane. The Android Control app is optional and is only needed for local phone/device actions (local files, UI automation, or apps that expose no server API).

## No vendor-credit runtime dependency

A released application must not require Gemini, Flow, Canva, Runway, Make, or another metered AI/design tool to remain operational. These tools may be optional development adapters. Runtime business logic, database access, APIs, background jobs, tests, and deployment artifacts must be source-controlled and replaceable. The app must remain usable when optional AI providers are unavailable.

This does not mean compute, hosting, storage, bandwidth, domains, or third-party APIs are unlimited or always free. Every app must declare resource budgets, free-tier constraints, and a fallback/degraded mode. Do not promise unlimited free operation.

## Required app manifest

Each app registers in `zoz_pro_managed_apps` with a unique owner-scoped `app_key`, platform, package/base URL, adapter key, lifecycle status, and autonomy mode.

Each app must publish an allowlisted capability manifest in `zoz_pro_managed_app_capabilities`. A capability has a stable key, input schema, risk level, constraints, and approval rule. Agents may invoke only registered, enabled capabilities.

## Command lifecycle

1. An authenticated owner/agent creates a command through `zoz-managed-app-control`.
2. The control plane checks app ownership, capability allowlist, risk, and idempotency.
3. Read-only and approved internal routine operations may be queued automatically.
4. External actions, financial operations, and destructive changes require owner approval.
5. The app's own backend worker claims a leased command using a per-app worker token; only a hash is stored.
6. The worker executes the capability in the app's own backend, then reports success/failure using the lease token.
7. Every registration, command, approval, worker claim, and result is recorded in `zoz_pro_managed_app_audit`.

Worker tokens are secrets: show once, store only hashes, rotate/revoke, and never embed them in mobile/web client bundles. Do not use a service-role key in an app client.

## Security boundaries

- RLS is enabled on all control-plane tables.
- Authenticated clients receive owner-scoped read access only; writes happen through the authenticated Edge Function.
- Worker tokens are per application and cannot be used as customer login credentials.
- Never expose one customer's data to ZOZ agents unless the product's tenant policy and customer authorization explicitly permit the operation.
- Audit logs must omit passwords, access tokens, payment credentials, and unnecessary personal data.
- Financial, external-publication, destructive, and customer-impacting actions require explicit approval unless a separately documented owner policy permits a narrowly scoped routine action.

## Required factory acceptance tests

- App registration and unique app identity.
- Cross-owner access denial.
- Capability allowlist enforcement.
- Risk/approval enforcement.
- Worker token hashing, rotation, revocation, and expiry.
- Idempotency and duplicate-command rejection.
- Lease expiry and retry behavior.
- Audit trail for all state transitions.
- Tenant isolation for customer data.
- App operation when optional AI/design vendors are unavailable.
- Build, installation, upgrade, rollback, and backup/restore verification.

## Current implementation boundary

The production database tables and `zoz-managed-app-control` Edge Function provide the initial registry, capability allowlist, owner command queue, worker-token authentication, approval gate, and audit path. Each app still needs its own backend adapter/worker and factory-generated manifest. The generic factory compiler, end-to-end worker execution, and per-app acceptance suite are not yet complete. Do not mark a product production-managed until those checks pass.

## Resource independence

Prefer a self-owned stack: source-controlled app code, Supabase-compatible PostgreSQL and Edge Functions where suitable, static hosting for static frontends, open-source local build/test tools, and exportable data. Keep providers behind adapters. If a free tier reaches a quota, pause safely, queue work, or use a self-hosted/alternative runtime; do not silently incur charges. No architecture can guarantee zero limits without owning sufficient compute and storage.
