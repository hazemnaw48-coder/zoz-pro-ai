# MEHWAR Integration & Export Readiness

> Audit date: 2026-11-24  
> Repository: `hazemnaw48-coder/zoz-pro-ai`  
> Audited branch: `feat/mehwar-service-output-ui`  
> Supabase development target: Preview `vjnwojrqduoxhetutxrs`  
> Customer-facing brand: **مِحور | MEHWAR**

## 1. Executive status

The existing repository is **not yet the MEHWAR React application requested for export**. It is an internal Node.js platform containing a standalone Arabic customer portal HTML file and a separate internal Android Flow Bridge application.

This audit has now verified that the Preview Supabase project already contains a useful SaaS tenant foundation and an active tenant-workspace Edge Function. Reuse these verified resources; do not create duplicate company, membership, workspace, task, or subscription tables.

No React/Vite build, MEHWAR ZIP, or MEHWAR APK has been produced or verified by this audit.

## 2. Repository and design-source audit

### Existing repository evidence

- Root `package.json` identifies the application as `zoz-pro`, requires Node.js >=20, and its `build` script runs Node syntax checks. It does not define a React/TypeScript/Vite customer-app build.
- The package does not declare React, React DOM, Vite, TypeScript, `@vitejs/plugin-react`, `vite-plugin-pwa`, or `@supabase/supabase-js`.
- `customer-portal.html` exists and uses Arabic RTL, the MEHWAR customer-facing name, Supabase JS from a CDN, and the Preview tenant Edge Function. It is a standalone dark-theme HTML portal, not the described multi-screen light-theme React app.
- The audited branch tree (242 entries) contains no Stitch export, no `src/App.tsx`, no `vite.config.ts`, and no MEHWAR-specific React page/component source.
- The current internal Android module is ZOZ Flow Bridge: Gradle namespace `com.zozpro.flowbridge`, application ID `com.zozpro.flowbridge.auto2`, and launcher label `ZOZ Pro Flow Operator 0.9.6`. It is not a MEHWAR customer application and must not be repurposed as one.

### Design-fidelity blocker

The source export for the approved Stitch design was not found in this repository. The existing HTML portal does not match the requested light-theme multi-screen design. Recreating the screens from prose or screenshots would not prove that the original design was preserved.

Before claiming exact design fidelity, add the actual Stitch/export source (or its original editable project export) to the MEHWAR customer-app project. Do not overwrite the internal control-center files.

## 3. Verified Supabase Preview foundation

Project inspection was read-only. Preview project status was `ACTIVE_HEALTHY`; PostgreSQL version reported by the project was 17.11.0.003. No Production project was queried or changed.

The public schema inventory contained 60 tables. These existing customer-tenant tables were found, with RLS enabled:

| Existing table | Verified purpose / important columns |
|---|---|
| `zoz_organizations` | Company/tenant record: id, name, slug, status, created_by, settings |
| `zoz_organization_memberships` | User membership: organization_id, user_id, role, status |
| `zoz_organization_workspaces` | Workspaces: organization_id, workspace_key, name, settings, status |
| `zoz_tenant_tasks` | Tenant tasks: organization_id, workspace_id, created_by, title, request, task_type, status, result, service_key, input_data |
| `zoz_subscription_plans` | Plan catalogue: plan_code, display_name, prices, currency, features, status, publicly_listed |
| `zoz_organization_subscriptions` | Tenant subscription state and plan relation |
| `zoz_tenant_audit_events` | Tenant audit events with actor, entity and JSON payload |

The existing organization-creation RPC is `public.zoz_create_organization(p_name text, p_slug text)`; it delegates to `zoz_private.create_organization_internal`. The tenant Edge Function calls this existing RPC during first-time onboarding. Do not add a second organization-creation function.

The memberships and authorization policies currently use roles including `owner`, `admin`, `manager`, and `operator`. The customer UI must map to these actual role values; do not introduce a conflicting `member` role without a migration and policy design.

### Existing RLS policy findings

The following controls were confirmed in `pg_policies`:

- Organizations: members can read their tenant; owner/admin roles can update; creation checks the authenticated creator.
- Memberships: users can read their own memberships or memberships in organizations they belong to; the owner bootstrap insert checks the authenticated user, owner role, active state, and organization creator.
- Workspaces: active organization members can read; owner/admin/manager can insert or update; owner/admin can delete.
- Tenant tasks: active organization members can read; owner/admin/manager/operator can insert and update; no DELETE policy was found.
- Subscriptions: organization members can read; owner bootstrap policy controls insertion.
- Plans: active, publicly listed plans can be read by anon/authenticated roles.
- Tenant audit: members can read; owner/admin roles can insert.

RLS being enabled is not, by itself, proof that every client action works. Continue testing both authorization and forged cross-tenant IDs with two separate test organizations.

## 4. Verified tenant Edge Function contract

The Preview project contains an active `zoz-tenant-workspace` Edge Function, version 5. Its `verify_jwt` setting is false, but the function performs its own bearer-token validation by calling Supabase Auth `/auth/v1/user`, requires a confirmed email, and checks active organization membership before tenant actions. It uses server-side Supabase credentials internally; those credentials must remain in Edge Function secrets and never enter the client build.

Verified action names:

| Action | Verified behavior | Current limitation |
|---|---|---|
| `bootstrap` | Lists the caller's active organizations, roles, workspaces, subscriptions and visible plans; can start first-organization onboarding through the existing RPC | No full invite/team-management interface |
| `service_catalog` | Returns eight deterministic service definitions | Not a live service-provider marketplace |
| `list_tasks` | Lists tenant tasks, optionally scoped to a workspace | Returns a limited task list; no full task search/filter API contract |
| `create_task` | Creates a tenant task after membership, workspace and Free-plan limit checks | No file attachment input; no audit event is written for this action |
| `run_task` | Creates a deterministic internal draft/result and marks the task completed | Not AI model execution, live research, or external execution; no audit event is written for this action |
| `save_business_profile` | Updates workspace business-profile settings and writes a tenant audit event | Role-restricted to owner/admin/manager |
| `create_workspace` | Creates a workspace if role and Free-plan constraints allow it | Free plan currently permits one workspace |

The Edge Function explicitly reports external actions as disabled. Its current task result is an internal structured draft and requires human review. Do not label this as an AI-generated deliverable, external action, or completed business operation.

### Audit gap to resolve before agent mutations

The function writes `zoz_tenant_audit_events` when saving a business profile. The inspected implementation does not write a matching audit record for `create_task` or `run_task`. No `update_task` action exists. Therefore, an agent bridge that claims to audit every mutation or update tasks would currently be inaccurate.

Until a server-side audited mutation contract is added and tested, keep the agent bridge read-only. Any later write endpoint must derive the tenant and actor from the verified session, enforce the role on the server, validate the target task belongs to the same organization/workspace, write an audit event, and require explicit owner approval for sensitive, destructive, financial, external, or permission-changing actions.

## 5. Plans and usage verified in Preview

The plan catalogue currently contains:

- **Free**: active and publicly listed; 0 EGP; 10 tasks/month, 2 members, 1 workspace; deterministic internal execution, task history and basic audit; no AI search or external actions.
- **Starter**: draft and not publicly listed; no published price.
- **Business**: draft and not publicly listed; no published price.

Therefore, the customer subscription screen may display Free as the active public plan. It must not present Starter/Business as purchasable or claim Pro pricing, checkout, payment, or paid entitlements are live. A payment provider integration is not established by this database inspection.

## 6. Files, deliverables and notifications

- One private Storage bucket named `zoz-pro-media` exists, with a 50 MiB size limit and an allow-list covering selected video, image, audio, VTT and PDF MIME types.
- No `storage.objects` RLS policies were found in the inspected policy inventory. Direct customer uploads must therefore not be presented as enabled until a tenant-scoped upload policy or verified server-side upload endpoint is implemented and tested.
- The current `zoz-tenant-workspace` contract has no upload or download action.
- No dedicated customer `deliverables` or `notifications` table was found among the inspected public tenant tables. Do not connect these screens to unrelated internal publishing/media tables or invent an API contract.

Required next work: tenant-scoped upload/download authorization, file ownership metadata, deliverable lifecycle and signed-download rules, notifications storage/dispatch rules, and cross-tenant tests.

## 7. PWA and Android compatibility audit

### Existing root PWA files

- `public/manifest.webmanifest` currently declares `ZOZ Pro Control`, short name `ZOZ Pro`, start URL `/#control`, and an empty icons array. It is not a MEHWAR customer manifest.
- `public/sw.js` caches a legacy root shell (`/`, `/styles.css`, `/app.js`, and the manifest). Its activation handler deletes every cache whose name is not its own cache. Do not reuse this service worker for MEHWAR; cache cleanup must be scoped to MEHWAR-owned cache names and private/authenticated data must never be cached.
- The current HTML portal is not a replacement for a React/Vite PWA shell.

### Existing Android project

The repository's Android module is the internal Flow Bridge app, with a ZOZ-specific application ID and launcher label, accessibility service and owner-bound device functions. It is not the MEHWAR app. Reusing it would mix internal device-control functions into a customer product and expose the wrong identity.

### Required MEHWAR PWA configuration

In a separate customer-app project, provide:

- Arabic document metadata: `lang="ar"`, `dir="rtl"`.
- Manifest name `مِحور | MEHWAR`, short name `مِحور`, standalone display, real deployment base path, and valid 192x192 and 512x512 icons (including a maskable icon).
- A dedicated MEHWAR service worker with an app-specific cache namespace, explicit static-shell allow-list, safe update handling, and no caching of authenticated Supabase responses, customer files, signed URLs, or session data.
- HTTPS installability and Android Chrome tests: install prompt, standalone launch, route refresh/deep links, offline fallback, service-worker update and sign-out behavior.

PWA installation is not a native APK. If an APK is required, create a distinct MEHWAR Android wrapper (for example, Capacitor) only after the React app is complete, then test app identity, deep links, file selection, upload/download, lifecycle and network behavior on Android devices.

## 8. Agent bridge source and safe implementation boundary

There is currently no `src/api/agentBridge.ts` in the audited branch. Do not claim that file is already implemented.

The first bridge iteration should be **read-only** and wrap only the verified `bootstrap`, `service_catalog`, and `list_tasks` actions through the authenticated user's Supabase client. Do not call the Edge Function with a service key from the browser. Do not enable agent task creation or execution until the server writes a complete audit event for every mutation and the owner-approval workflow exists.

Expected future client wrapper contract:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

type TenantAction =
  | "bootstrap"
  | "service_catalog"
  | "list_tasks";

type TenantFunctionResponse<T> = {
  ok: boolean;
  error?: string;
} & T;

export function createAgentBridge(client: SupabaseClient) {
  async function invoke<T>(
    action: TenantAction,
    payload: Record<string, unknown> = {},
  ): Promise<T> {
    const { data, error } = await client.functions.invoke<
      TenantFunctionResponse<T>
    >("zoz-tenant-workspace", {
      body: { action, ...payload },
    });

    if (error) throw new Error(error.message);
    if (!data?.ok) throw new Error(data?.error ?? "MEHWAR operation failed");
    return data as T;
  }

  return {
    read: {
      bootstrap: () => invoke<{
        organizations: unknown[];
        plans: unknown[];
        execution_mode: string;
        external_actions_enabled: boolean;
      }>("bootstrap"),

      serviceCatalog: (organizationId: string) =>
        invoke<{ services: unknown[] }>("service_catalog", {
          organization_id: organizationId,
        }),

      tasks: (organizationId: string, workspaceId?: string) =>
        invoke<{ tasks: unknown[] }>("list_tasks", {
          organization_id: organizationId,
          ...(workspaceId ? { workspace_id: workspaceId } : {}),
        }),
    },
  };
}
```

This is a read-only reference adapter for the verified API, not an installed or tested application file. Replace `unknown` with generated database/API types after the customer app is established. No mutating agent methods are exposed in this first iteration.

## 9. Export blockers and completion gates

Before creating `MEHWAR-Business-Operations-App.zip`, the following must be completed:

1. Obtain and add the original Stitch editable/export source so the approved design can be preserved.
2. Establish the dedicated React + TypeScript + Vite customer-app project without changing internal Node/Android files.
3. Add pinned dependencies and a committed lockfile; define `.env.example` with only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` placeholders.
4. Implement auth, onboarding, workspace and role-aware navigation against the verified Preview contract.
5. Build the dashboard and task views from real tenant-scoped data; do not invent KPIs or progress values.
6. Add safe customer file upload/download and deliverables only after storage authorization is implemented and tested.
7. Add notifications only after a verified source/API exists.
8. Display plan entitlements from the verified plan catalogue; keep draft paid plans visibly unavailable.
9. Add the read-only agent bridge; add audited mutation/approval endpoints before enabling agent writes.
10. Add MEHWAR PWA assets, manifest and service worker in the customer-app project.
11. Run TypeScript checks, unit/integration tests, two-tenant RLS/IDOR tests, production build, PWA checks and Android smoke tests.
12. Create and inspect the final ZIP; separately build/test an APK if a native Android package is requested.

### Current test/export status

| Item | Status |
|---|---|
| Preview Supabase project reachable/healthy | Verified |
| Existing tenant tables and RLS policies inspected | Verified read-only |
| Existing tenant Edge Function source inspected | Verified |
| Existing Free plan/limits inspected | Verified |
| Dedicated MEHWAR React/Vite source | Not present |
| Stitch source export in repository | Not found |
| Agent bridge file in repository | Not present |
| MEHWAR upload/deliverables/notifications end-to-end | Not implemented/verified |
| MEHWAR PWA installability | Not configured/verified |
| MEHWAR native APK | Not built |
| MEHWAR React TypeScript/Vite build | Not run; current `npm run build` is for the Node.js internal app |
| Final ZIP export | Not created |

**Readiness conclusion:** the backend tenant foundation is partially present and reusable in Preview, but the customer-facing MEHWAR application source, exact design source, file/notification workflows, complete audited agent mutations, PWA package and export tests remain outstanding. No Production changes were made.
