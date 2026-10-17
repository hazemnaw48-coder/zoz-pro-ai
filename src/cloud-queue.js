export const CLOUD_QUEUE_TOPIC = "zoz-pro-control-commands";

export function isVercelRuntime() {
  return process.env.VERCEL === "1"
    || ["production", "preview", "development"].includes(process.env.VERCEL_ENV);
}

export function isRenderRuntimeRequested() {
  return process.env.ZOZ_PRO_EXECUTION_RUNTIME === "render-poll"
    || process.env.RENDER === "true"
    || Boolean(process.env.RENDER_SERVICE_ID);
}

export function isRenderPollRuntime() {
  return process.env.ZOZ_PRO_EXECUTION_RUNTIME === "render-poll"
    && String(process.env.ZOZ_PRO_STATE_BACKEND ?? "").trim().toLowerCase() === "supabase";
}

export function isCloudRuntime() {
  return isVercelRuntime() || isRenderPollRuntime();
}

export function getExecutionRuntime() {
  if (isVercelRuntime()) return "vercel-queue";
  if (isRenderPollRuntime()) return "render-supabase-poll";
  if (isRenderRuntimeRequested()) return "render-misconfigured";
  return "local-cli";
}

export async function enqueueCloudCommand(commandId) {
  if (typeof commandId !== "string" || !commandId.trim()) {
    throw new Error("commandId is required.");
  }
  // On Render the command has already been committed to the Supabase state
  // row before this method is called. The single-instance poller reads that
  // durable command list; no Vercel service or second queue store is required.
  if (isRenderPollRuntime()) {
    return { commandId, accepted: true, transport: "supabase-state-poll" };
  }
  if (!isVercelRuntime()) {
    throw new Error("Cloud queue dispatch requires Vercel Queue or Render polling with Supabase state.");
  }
  const { send } = await import("@vercel/queue");
  return send(CLOUD_QUEUE_TOPIC, { commandId }, {
    idempotencyKey: commandId,
    retentionSeconds: 86400,
  });
}
