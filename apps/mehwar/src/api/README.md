# MEHWAR API adapter

This folder contains the first real client-side integration with the existing
Supabase Preview tenant API. It is intentionally read-only.

## Verified backend actions

| Method | Edge Function action | Required input |
|---|---|---|
| `bootstrap()` | `bootstrap` | Authenticated Supabase session |
| `serviceCatalog(organizationId)` | `service_catalog` | Active tenant organization UUID |
| `listTasks(organizationId, workspaceId?)` | `list_tasks` | Active tenant organization UUID; optional workspace UUID |

All requests call the existing `zoz-tenant-workspace` Edge Function. The
function validates the bearer token and active membership on the server.
Do not send a service-role key from the browser.

## Example

```ts
import { createAgentBridge } from "./agentBridge";
import { supabase } from "../lib/supabase";

const tenantApi = createAgentBridge(supabase);
const bootstrap = await tenantApi.bootstrap();
```

## Deliberately not exposed

There are no agent mutation methods in this adapter. The deployed function's
`create_task`, `run_task`, `create_workspace`, and
`save_business_profile` actions are not exposed here because the current
backend does not write a complete tenant audit record for every mutation and
does not provide the requested owner-approval workflow.

Do not add mutation methods until server-side authorization, tenant scoping,
audit events, approval records, and cross-tenant IDOR tests are implemented.
