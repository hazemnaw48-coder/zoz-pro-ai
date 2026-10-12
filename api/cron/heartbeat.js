import { get } from "@vercel/blob";

const MAX_BLOB_BYTES = 256 * 1024;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method_not_allowed" });
  }

  if (process.env.VERCEL_ENV !== "production") {
    return res.status(200).json({
      status: "preview_only",
      project: "ZOZ Pro",
      checkedAt: new Date().toISOString(),
      note: "Scheduled cloud worker remains disabled outside production.",
    });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ status: "blocked", reason: "blob_storage_not_configured" });
  }

  try {
    const blob = await get("state/production/zoz-pro-state.json", {
      access: "private",
    });
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return res.status(503).json({ status: "blocked", reason: "persistent_state_unavailable" });
    }

    const chunks = [];
    let bytes = 0;
    for await (const chunk of blob.stream) {
      bytes += chunk.length;
      if (bytes > MAX_BLOB_BYTES) {
        return res.status(413).json({ status: "blocked", reason: "state_size_limit_exceeded" });
      }
      chunks.push(chunk);
    }

    const state = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const pendingApprovals = Array.isArray(state.approvals)
      ? state.approvals.filter((item) => item.status === "pending").length
      : 0;
    const queuedCommands = Array.isArray(state.controlCommands)
      ? state.controlCommands.filter((item) => item.status === "queued").length
      : 0;

    return res.status(200).json({
      status: "ok",
      project: "ZOZ Pro",
      checkedAt: new Date().toISOString(),
      pendingApprovals,
      queuedCommands,
      executor: "not_started",
      financialExecutionEnabled: false,
      externalSendEnabled: false,
    });
  } catch {
    return res.status(503).json({ status: "blocked", reason: "persistent_state_check_failed" });
  }
}
