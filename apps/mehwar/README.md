# مِحور | MEHWAR — customer application foundation

This directory is an isolated foundation for the MEHWAR customer-facing
application. It does not replace the repository's internal Node.js service or
the internal Android Flow Bridge app.

## Current state

- Supabase Preview URL template and safe client factory are present.
- A typed read-only adapter is present for the verified
  `zoz-tenant-workspace` Edge Function.
- No new database tables, migrations, RPCs, or Edge Functions were created.
- No customer UI has been recreated because the approved editable Stitch
  source was not found in the repository.
- No Vite build or ZIP export has been claimed.

## Environment

Copy `.env.example` to `.env.local` and set the Preview publishable/anon key.
Never add a service-role key, database password, or Edge Function secret to
this file or any browser bundle.

## Backend adapter

See [src/api/README.md](src/api/README.md) for the exact read-only operations
that were verified against the deployed Preview Edge Function.

## Before completing the app

1. Add the approved editable Stitch source/export.
2. Add the React/Vite entry point and pages by translating that source without
   redesigning it.
3. Wire auth, tenant selection and the existing read-only adapter.
4. Implement and test secure tenant-scoped storage, deliverables and
   notifications before exposing those controls.
5. Implement server-side audit and owner approval before enabling agent writes.
6. Add MEHWAR-specific PWA assets and test install/update/offline behavior.
7. Run the actual TypeScript, build, tenant-isolation and Android tests.
