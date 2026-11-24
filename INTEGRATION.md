# MEHWAR Integration & Readiness Report

> Audit date: 2026-11-24  
> Audited repository: `hazemnaw48-coder/zoz-pro-ai`  
> Audited ref: `feat/mehwar-service-output-ui`  
> Supabase target requested for development: Preview project `vjnwojrqduoxhetutxrs`  
> Customer-facing brand: **مِحور | MEHWAR**

## 1. Important status: source project is not yet the requested React application

The audited branch currently contains a Node.js application, not a React + TypeScript + Vite application.

Evidence from the repository:
- `package.json` declares `"name": "zoz-pro"`, Node.js >=20, and scripts that run `node --check` against server-side JavaScript files.
- `package.json` does not declare React, React DOM, Vite, TypeScript, `@vitejs/plugin-react`, `vite-plugin-pwa`, or `@supabase/supabase-js`.
- The following expected application files were not found on this branch: `src/App.tsx`, `vite.config.ts`, `src/api/agentBridge.ts`, `public/manifest.json`, `supabase/schema.sql`, and `supabase/functions/zoz-tenant-workspace/index.ts`.
- The branch contains `customer-portal.html`, a standalone Arabic RTL customer portal using Supabase JS from a CDN and a Preview Edge Function URL.

Therefore, this document is an evidence-based integration audit and implementation contract. It does **not** claim that the React app, a native Android package, a React agent bridge, or a production multi-tenant schema has already been built.

## 2. Existing customer portal integration observed

The existing `customer-portal.html` contains:
- Arabic document language and RTL direction.
- Customer-facing name `مِحور | MEHWAR`.
- A Supabase client configured for the Preview URL `https://vjnwojrqduoxhetutxrs.supabase.co`.
- A publishable/anon client key embedded in the browser source. A publishable key is intended for client use, but it is safe only when database and Storage access are correctly protected by RLS and grants.
- Authentication actions and calls to the Edge Function route `/functions/v1/zoz-tenant-workspace`.
- UI actions for workspace, business profile, and task creation.

The browser source is not proof that the called Edge Function currently exists, that every action is implemented server-side, or that all database policies are correct. Verify the deployed function and its action contract in the Preview project before relying on it.

## 3. Supabase environment contract

Use only the Preview project during development:

```dotenv
VITE_SUPABASE_URL=https://vjnwojrqduoxhetutxrs.supabase.co
VITE_SUPABASE_ANON_KEY=<Preview publishable-or-anon-key>
```

Rules:
1. Use a publishable key (or legacy anon key) in browser/mobile code only.
2. Never place a Supabase secret key or `service_role` key in Vite variables, source files, build output, GitHub, or an Android package.
3. Store privileged secrets only in Supabase Edge Function secrets.
4. Never assume a table, RPC, Edge Function, bucket, or action exists because a client calls it.
5. Keep Preview and Production configuration separate. No Production schema or data changes are authorized by this development task.

## 4. Required multi-tenant data model and security

Before writing migrations, introspect the existing Preview database and reuse existing tables where their semantics match. Do not blindly apply the illustrative schema from earlier design notes.

The required authorization model is:
- A company/workspace record has a stable UUID.
- A membership record binds `auth.uid()` to a company and an allowed role.
- Every tenant-owned row carries a company/workspace foreign key.
- Every exposed table has RLS enabled.
- SELECT policies restrict rows to companies in which the authenticated user is an active member.
- INSERT policies validate that the new row belongs to an authorized company.
- UPDATE policies include both `USING` and `WITH CHECK` to prevent tenant reassignment.
- DELETE is denied by default unless a specific owner/admin workflow is explicitly approved.
- Authorization must never trust user-editable `user_metadata` claims.
- Views exposed through the Data API must use `security_invoker = true` where supported, or otherwise be protected from bypassing RLS.
- Any `SECURITY DEFINER` function requires a separate security review and must not be used as a shortcut around RLS.

Suggested logical entities (names are illustrative, not claims about existing tables):
- companies / workspaces
- company_members
- service_requests
- tasks
- deliverables
- notifications
- subscriptions / usage_counters
- agent_audit_logs

## 5. Frontend API boundaries

The future React application should keep Supabase access in typed modules rather than embedding database calls in page components.

Suggested module boundaries:
- `src/lib/supabase.ts`: typed Supabase client and environment validation.
- `src/api/auth.ts`: sign-in, sign-up, sign-out, password reset, session.
- `src/api/workspaces.ts`: current user's authorized workspaces and profile.
- `src/api/tasks.ts`: tenant-scoped task reads and approved mutations.
- `src/api/deliverables.ts`: metadata and authorized download URLs.
- `src/api/subscriptions.ts`: plan and usage data, read-only until billing integration is approved.
- `src/api/agentBridge.ts`: narrow allowlisted operations for an authenticated agent.

All data access must be tenant-scoped by the server-side authorization model. A client-supplied `company_id` is a filter, never proof of authorization.

## 6. Agent bridge: required security contract

No `src/api/agentBridge.ts` file exists in the audited branch. Do not describe it as implemented.

When added to the React project, the bridge must:
- Default to read-only operations.
- Use the current authenticated user's session for customer-scoped reads.
- Call a server-side Edge Function for privileged operations; never embed service credentials.
- Enforce an explicit operation allowlist and validate input/output schemas.
- Derive company membership and role from trusted server-side records, not caller-supplied role/company claims.
- Require owner approval for destructive, financial, external, or permission-changing actions.
- Record an audit event with actor, tenant, operation, target, approval reference, timestamp, and outcome.
- Avoid exposing cross-tenant search or arbitrary SQL/RPC execution.
- Return stable error codes and request IDs without leaking secrets or other tenants' data.

Suggested operation classes:
- Read: app status, current profile, authorized tasks, authorized deliverables, plan/usage.
- Mutate with ordinary authorization: create/update a task within the active tenant.
- Owner approval: delete records, change roles, alter billing, publish externally, send messages, or perform any paid action.

## 7. PWA and Android audit

The audited branch currently has:
- `public/manifest.webmanifest` with the name `ZOZ Pro Control`, short name `ZOZ Pro`, a control-panel start URL, and an empty icons array.
- `public/sw.js` caching a legacy shell (`/`, `/styles.css`, `/app.js`, and the manifest).
- No `vite.config.ts`, no Vite PWA plugin configuration, and no React application entry point were found.

This is not an acceptable customer-facing MEHWAR PWA configuration. The current manifest exposes internal ZOZ naming and must not be reused for the customer app.

Required MEHWAR PWA settings once the React app exists:
- `name`: `مِحور | MEHWAR`
- `short_name`: `مِحور`
- `lang`: `ar`
- `dir`: `rtl`
- `display`: `standalone`
- `start_url` and `scope`: match the actual deployment base path.
- `theme_color` and `background_color`: match the approved light navy/teal design tokens.
- Include valid 192x192 and 512x512 PNG icons, with a maskable icon where appropriate.
- Register the service worker from the application entry point.
- Do not cache authenticated API responses, Supabase session data, signed URLs, or private deliverables in the public shell cache.
- Use a versioned app-shell cache and clean up old shell caches without deleting unrelated origin caches.
- Verify installability over HTTPS and test standalone launch, offline fallback, update behavior, and safe sign-out on Android Chrome.

PWA is not the same as a native APK. A native Android package would require a separate Android wrapper/build workflow (for example Capacitor) and device testing.

## 8. Build and test status

No React/Vite build was run for this branch because the required React/Vite project files and dependencies are absent. The existing `npm run build` script in this repository is a Node syntax-check chain for the internal Node application; it is not a MEHWAR React build and must not be reported as one.

Before claiming readiness, the React project must pass:
1. dependency installation from a committed lockfile;
2. TypeScript type-check;
3. Vite production build;
4. unit tests for auth/workspace/task API modules;
5. tenant-isolation tests with two separate test users and companies;
6. RLS tests for SELECT/INSERT/UPDATE/DELETE, including forged company IDs;
7. PWA manifest/service-worker checks;
8. Android installation and smoke tests.

## 9. Outstanding work

- Obtain the actual Google Stitch source export and add it to the correct project without recreating the design from screenshots.
- Create or identify the real React + TypeScript + Vite app in a dedicated MEHWAR customer-app branch/repository.
- Verify the Preview Edge Function `zoz-tenant-workspace` and document its actual actions and schemas.
- Introspect Preview tables, RLS policies, Storage buckets, and grants before creating migrations.
- Implement and test the typed tenant-aware API modules.
- Implement the agent bridge as a server-authorized allowlist, not a privileged browser-side SDK wrapper.
- Replace the internal ZOZ PWA manifest only in the customer-app project, not in the internal control-center app.
- Build, test, and package the PWA; separately decide whether a native APK is required.

## 10. Readiness conclusion

**Current status: integration discovery and documentation only.** The existing repository branch is an internal Node.js system with a standalone customer portal HTML file. It is not yet the requested React + TypeScript + Vite MEHWAR customer app. No native APK, verified React build, complete agent bridge, or confirmed end-to-end multi-tenant customer workflow is established by this audit.
