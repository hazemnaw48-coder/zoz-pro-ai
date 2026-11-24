# MEHWAR customer app — verified status

## Completed and committed

- Isolated customer application foundation under `apps/mehwar/`; internal Node.js service and Android Flow Bridge remain untouched.
- Preview-only Supabase client factory uses environment configuration and never embeds a service-role credential.
- Typed, read-only adapter for the active Preview `zoz-tenant-workspace` Edge Function (version 5).
- Tasks screen calls the tenant API, handles loading/error/empty/success, search and status filtering.
- Task status labels now match the database's actual allowed statuses: `queued`, `running`, `completed`, `blocked`, `failed`.
- Integration documentation's client example now uses the actual exported `getSupabaseClient()` factory.
- Existing tenant schema/RLS and the existing `zoz_create_organization(p_name,p_slug)` RPC were inspected. No tables, migrations, functions, or Production resources were changed.

## Verified backend boundary

- Preview project is `ACTIVE_HEALTHY`.
- `zoz-tenant-workspace` is ACTIVE version 5.
- Authenticated tenant membership is validated server-side by the Edge Function.
- `public.zoz_tenant_tasks` currently contains a real completed task; status values were queried read-only.
- Task list is read-only. Agent writes remain disabled in the client because audit/owner approval is incomplete.
- No service-role key is included in browser files.

## Not closed yet — required inputs / gates

- The editable approved Stitch export is not present in the repository or current mounted Downloads. Therefore exact UI fidelity and all nine connected screens cannot be implemented/verified yet.
- `apps/mehwar` still has no Vite package manifest, React entry point, full navigation shell, lockfile, or production build.
- No PWA install test, Android package, end-to-end authenticated tenant test, or downloadable ZIP has been produced.
- Uploads/deliverables/notifications and secure approval/audit-backed mutations remain unimplemented.

## Next acceptance gate

Add the actual Stitch source/export to this directory or provide it in the conversation. Continue on `feat/mehwar-customer-foundation`; preserve the design and implement the app shell, then run install/typecheck/build, tenant-isolation checks, PWA tests, and create a verified ZIP. Do not merge to Production or modify the Production Supabase project.
