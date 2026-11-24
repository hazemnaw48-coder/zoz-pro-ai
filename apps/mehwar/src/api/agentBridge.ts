import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only client adapter for the already deployed Preview function:
 *   zoz-tenant-workspace (version 5)
 *
 * The function validates the caller's bearer token and active tenant
 * membership server-side. This module deliberately exposes no mutations.
 */
export type TenantRole = "owner" | "admin" | "manager" | "operator";

export interface TenantPlan {
  plan_code: string;
  display_name: string;
  description: string | null;
  monthly_price: number | null;
  currency: string | null;
  features: Record<string, unknown> | null;
}

export interface TenantOrganization {
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  role: TenantRole;
  subscription: {
    plan_code: string;
    status: string;
    billing_interval: string | null;
    trial_ends_at: string | null;
    current_period_end: string | null;
  } | null;
  workspaces: Array<{
    id: string;
    workspace_key: string;
    name: string;
    status: string;
    settings: Record<string, unknown>;
  }>;
}

export interface TenantTask {
  id: string;
  title: string;
  task_type: string;
  status: string;
  result: Record<string, unknown> | null;
  created_at: string;
  completed_at: string | null;
}

export interface TenantService {
  key: string;
  name: string;
  description: string;
}

export interface BootstrapResponse {
  needs_onboarding?: boolean;
  organizations?: TenantOrganization[];
  plans: TenantPlan[];
  execution_mode?: "free_deterministic" | string;
  external_actions_enabled?: false;
}

interface FunctionEnvelope<T> {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export class TenantApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "TenantApiError";
  }
}

type Invoke = <T>(
  action: string,
  payload?: Record<string, string>,
) => Promise<T>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requireUuid(value: string, label: string): string {
  if (!UUID.test(value)) {
    throw new TenantApiError(`قيمة ${label} غير صالحة.`, 400, "invalid_id");
  }
  return value;
}

export function createAgentBridge(client: SupabaseClient) {
  const invoke: Invoke = async <T>(
    action: string,
    payload: Record<string, string> = {},
  ): Promise<T> => {
    const { data, error } = await client.functions.invoke<FunctionEnvelope<T>>(
      "zoz-tenant-workspace",
      { body: { action, ...payload } },
    );

    if (error) {
      throw new TenantApiError(error.message, undefined, "function_invoke_failed");
    }
    if (!data || data.ok !== true) {
      throw new TenantApiError(
        typeof data?.error === "string" ? data.error : "تعذر إكمال الطلب.",
        undefined,
        "tenant_function_rejected",
      );
    }
    return data as T;
  };

  return {
    /** Read the authenticated user's organizations, memberships and plans. */
    bootstrap: () => invoke<BootstrapResponse>("bootstrap"),

    /** Read the fixed service catalogue for a verified tenant membership. */
    serviceCatalog: (organizationId: string) =>
      invoke<{ services: TenantService[] }>("service_catalog", {
        organization_id: requireUuid(organizationId, "المؤسسة"),
      }),

    /** Read the most recent tasks visible to the selected tenant. */
    listTasks: (organizationId: string, workspaceId?: string) =>
      invoke<{ tasks: TenantTask[] }>("list_tasks", {
        organization_id: requireUuid(organizationId, "المؤسسة"),
        ...(workspaceId
          ? { workspace_id: requireUuid(workspaceId, "مساحة العمل") }
          : {}),
      }),
  };
}

export type AgentBridge = ReturnType<typeof createAgentBridge>;
