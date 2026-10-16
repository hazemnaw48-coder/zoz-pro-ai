export const CLOUD_QUEUE_TOPIC = "zoz-pro-control-commands";

export function isVercelRuntime() {
  return process.env.VERCEL === "1"
    || ["production", "preview", "development"].includes(process.env.VERCEL_ENV);
}

export async function enqueueCloudCommand(commandId) {
  if (!isVercelRuntime()) {
    throw new Error("Cloud queue dispatch is only available in the Vercel runtime.");
  }
  if (typeof commandId !== "string" || !commandId.trim()) {
    throw new Error("commandId is required.");
  }
  const { send } = await import("@vercel/queue");
  return send(CLOUD_QUEUE_TOPIC, { commandId }, {
    idempotencyKey: commandId,
    retentionSeconds: 86400,
  });
}
