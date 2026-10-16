import { QueueClient } from "@vercel/queue";
import { processCloudCommand } from "../../src/cloud-worker.js";

const queue = new QueueClient();

export default queue.handleNodeCallback(async (message, metadata) => {
  if (!message || typeof message.commandId !== "string" || !message.commandId.trim()) {
    throw new Error("Invalid ZOZ Pro cloud command queue payload.");
  }

  await processCloudCommand(message.commandId, {
    deliveryCount: metadata?.deliveryCount,
  });
}, {
  visibilityTimeoutSeconds: 120,
  retry: (_error, metadata) => ({
    afterSeconds: Math.min(300, Math.max(5, 2 ** Math.min(metadata?.deliveryCount ?? 1, 8))),
  }),
});
