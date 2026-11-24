# مِحور | MEHWAR — Integration Guide

> This guide describes the **verified Preview integration contract** for the
> customer application. It is not a claim that the full React/PWA application
> or every requested backend feature is complete.

## 1. Scope and safety

- Target environment: Supabase Preview
  (`https://vjnwojrqduoxhetutxrs.supabase.co`).
- Customer product name: **مِحور | MEHWAR**.
- Keep all customer UI Arabic-first and RTL.
- Never place a service-role key, database password, or Edge Function secret
  in browser code, `.env.local`, a PWA asset, or a committed file.
- Do not modify the Production Supabase project during Preview development.
- Reuse the existing tenant schema, RPC and Edge Function. Do not create
  parallel `companies`, `tasks`, memberships, or audit tables.

## 2. Environment

Copy `.env.example` to `.env.local`:

```dotenv
VITE_SUPABASE_URL=https://vjnwojrqduoxhetutxrs.supabase.co
VITE_SUPABASE_ANON_KEY=your-preview-publishable-or-anon-key
```

Only the public publishable/anon key belongs in the browser. The application
factory in `src/lib/supabase.ts` validates both variables and creates a
persistent browser session.

## 3. Verified backend contract

The existing Edge Function is `zoz-tenant-workspace` (Preview deployment
version 5 at the time of inspection). The client calls it through
`supabase.functions.invoke`. The function validates the bearer token,
confirmed user identity, and active tenant membership on the server.

| Client method | Action | Input | Output used by the app |
|---|---|---|---|
| `bootstrap()` | `bootstrap` | Authenticated session | onboarding state, organizations, memberships/roles, plans |
| `serviceCatalog(organizationId)` | `service_catalog` | Organization UUID | service definitions |
| `listTasks(organizationId, workspaceId?)` | `list_tasks` | Organization UUID; optional workspace UUID | tenant-visible task records |

All three methods are read-only from the customer adapter's perspective.
UUIDs are validated client-side for early feedback; this is **not** the
security boundary. Server-side identity and membership validation plus
database RLS are the security boundary.

### Tenant and role model already present

The inspected Preview schema already includes:

- `zoz_organizations`
- `zoz_organization_memberships`
- `zoz_organization_workspaces`
- `zoz_tenant_tasks`
- `zoz_subscription_plans`
- `zoz_organization_subscriptions`
- `zoz_tenant_audit_events`

Roles observed in the existing tenant model: `owner`, `admin`,
`manager`, and `operator`. Do not substitute a new `member` role.

The existing onboarding RPC is
`public.zoz_create_organization(p_name, p_slug)`. Reuse it through the
existing server flow; do not create a second organization-creation RPC.

## 4. Using the API adapter from a page

```tsx
import { createAgentBridge } from "../api/agentBridge";
import { getSupabaseClient } from "../lib/supabase";

const tenantApi = createAgentBridge(getSupabaseClient());

// After authentication and tenant selection:
const result = await tenantApi.listTasks(activeOrganizationId, activeWorkspaceId);
```

The adapter is intentionally constructed from the configured Supabase
client. Do not construct an `AgentContext` in the browser and treat it as
authorization; the server derives and verifies the caller from the bearer
token.

See `src/pages/TasksScreen.tsx` for a complete read-only page example with
loading, error, empty, search, and status-filter states.

## 5. Current task response limits

The verified task type currently exposes:

- `id`
- `title`
- `task_type`
- `status`
- `result`
- `created_at`
- `completed_at`

The verified response does **not** establish fields for priority,
progress percentage, due date, assigned team, attachments, or activity
timeline. Do not render guessed values for these fields. A priority filter
must wait until the backend contract supplies a verified priority field.

## 6. Existing server actions deliberately not exposed for agent writes

The deployed function also contains actions such as `create_task`,
`run_task`, `create_workspace`, and `save_business_profile`. Their
presence does not mean they satisfy the complete MEHWAR security contract.

At the time of inspection:

- `create_task` and `run_task` did not write a complete audit event.
- There was no verified owner-approval workflow for sensitive operations.
- There was no verified customer deliverables upload/download action.
- There was no verified notification delivery contract.
- The current `run_task` behavior is deterministic internal processing,
  not proof of an external AI execution or publishing integration.

Therefore `agentBridge.ts` exposes **no mutation method**. Keep the agent
bridge read-only until server-side authorization, tenant scoping, audit
logging, approval records, and cross-tenant IDOR tests are implemented.

## 7. Storage, deliverables, notifications, and subscriptions

The Preview project has a private `zoz-pro-media` bucket, but the inspected
state did not establish customer-safe object policies or an Edge Function
upload/download contract. Do not upload customer files directly from the
browser until tenant-scoped Storage RLS policies and signed access are
verified.

The existing plan catalogue is readable through `bootstrap()`. The Free
plan was observed as active/public with a 10 tasks/month limit, 2 members,
1 workspace, deterministic internal execution, and basic task history.
Starter/Business pricing was not published in the inspected state. Do not
show Pro as purchasable or initiate payment until an approved price and
payment backend exist.

No complete customer notification-delivery API or customer deliverables
API was verified. UI placeholders must be clearly labelled unavailable,
not populated with fake records.

## 8. Security checklist before enabling writes

- [ ] Confirmed-email authentication and session refresh.
- [ ] Server derives `auth.uid()`; never trust a browser-supplied user ID.
- [ ] Every query and mutation checks active organization membership.
- [ ] RLS denies cross-tenant reads and writes, including guessed UUIDs.
- [ ] Storage object paths are tenant-scoped and protected by Storage RLS.
- [ ] Every mutation writes an immutable audit event server-side.
- [ ] Sensitive actions require a recorded owner approval.
- [ ] Rate limits and payload validation are enforced server-side.
- [ ] Automated tests cover cross-tenant IDOR and role escalation.

## 9. Test IDs and automation

Use stable `data-testid` attributes on important controls, for example:

- `tasks-screen`
- `tasks-search`
- `tasks-status-filter`
- `tasks-retry`
- `task-row-<uuid>`

Tests should assert loading, success, empty and error states. Never rely only
on visible text selectors for critical actions.

## 10. Current implementation and verification status

Implemented in this branch:

- Supabase Preview client factory using the two required environment
  variables.
- Typed read-only adapter for the three verified Edge Function actions.
- UUID input validation and normalized function errors.
- This integration guide and a read-only task-list page example.

Not yet verified or implemented:

- Approved editable Stitch source import and pixel-faithful screen recreation.
- Full React/Vite application shell, package manifest, router and design
  component system.
- Authentication screens and end-to-end onboarding UI.
- Task create/update APIs with audit and owner approval.
- Priority/progress/due-date/assignee task fields.
- Customer file upload/download and deliverables.
- Customer notifications and support messaging.
- Payment checkout and live Pro subscription.
- PWA install/update/offline validation and Android package.
- TypeScript build, production build, device tests, tenant isolation tests.

No Production database or deployment was changed as part of this integration
work. No build result or ZIP export is claimed by this document.
