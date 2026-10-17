export const CLOUD_QUEUE_TOPIC = "zoz-pro-control-commands";

export function isVercelRuntime() {
  return process.env.VERCEL === "1"
    || ["production", "preview", "development"].includes(process.env.VERCEL_ENV);
}

export function isCloudRunRuntimeRequested() {
  return process.env.ZOZ_PRO_EXECUTION_RUNTIME === "cloud-run-inband"
    || Boolean(process.env.K_SERVICE);
}

export function isCloudRunSupabaseRuntime() {
  return isCloudRunRuntimeRequested()
    && process.env.ZOZ_PRO_EXECUTION_RUNTIME === "cloud-run-inband"
    && String(process.env.ZOZ_PRO_STATE_BACKEND ?? "").trim().toLowerCase() === "supabase";
}

export function isCloudRuntime() {
  return isVercelRuntime() || isCloudRunRuntimeRequested();
}

export function getExecutionRuntime() {
  if (isCloudRunRuntimeRequested()) {
    return isCloudRunSupabaseRuntime() ? "google-cloud-run-supabase-inband" : "cloud-run-misconfigured";
  }
  if (isVercelRuntime()) return "vercel-queue";
  return "local-cli";
}

export async function enqueueCloudCommand(commandId) {
  if (typeof commandId !== "string" || !commandId.trim()) {
    throw new Error("commandId is required.");
  }
  // Cloud Run persists commands in Supabase and executes them in-band in the
  // authenticated API request. No separate queue service is used.
  if (isCloudRunRuntimeRequested()) {
    if (!isCloudRunSupabaseRuntime()) {
      throw new Error("Cloud Run requires ZOZ_PRO_EXECUTION_RUNTIME=cloud-run-inband and ZOZ_PRO_STATE_BACKEND=supabase.");
    }
    return { commandId, accepted: true, transport: "supabase-inband" };
  }
  if (!isVercelRuntime()) {
    throw new Error("Cloud queue dispatch requires the configured Cloud Run runtime or the legacy Vercel queue runtime.");
  }
  const { send } = await import("@vercel/queue");
  return send(CLOUD_QUEUE_TOPIC, { commandId }, {
    idempotencyKey: commandId,
    retentionSeconds: 86400,
  });
}
