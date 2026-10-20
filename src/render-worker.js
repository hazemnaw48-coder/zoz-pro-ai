import { createStateStore } from "./store.js";
import { isRenderPollRuntime, isRenderRuntimeRequested } from "./cloud-queue.js";
import { isSupportedCloudInstruction, processCloudCommand } from "./cloud-worker.js";

const DEFAULT_POLL_INTERVAL_MS = 2500;
const CLOUD_WORKER = "ZOZ Pro Cloud Worker";
const state = {
  enabled: false,
  running: false,
  state: "disabled",
  lastPollAt: null,
  lastCommandId: null,
  lastCompletedAt: null,
  currentCommandId: null,
  lastError: null,
  polls: 0,
  processedCommands: 0,
};

function safeErrorCode(error) {
  const code = String(error?.code ?? error?.name ?? "worker_poll_failed");
  return /^[a-zA-Z0-9_-]{1,80}$/.test(code) ? code : "worker_poll_failed";
}

export function getRenderWorkerStatus() {
  return { ...state };
}

/**
 * One poll of the durable command list. Supabase is the source of truth;
 * a command is eligible only after the API persisted it and only when it
 * is safe for the cloud worker. Explicitly approved or external actions
 * are never executed by this poller.
 */
export async function pollRenderQueueOnce(options = {}) {
  const status = options.status ?? state;
  const createStore = options.createStore ?? (() => createStateStore());
  const execute = options.processCommand ?? processCloudCommand;
  try {
    const store = createStore();
    const snapshot = await store.load();
    status.lastPollAt = new Date().toISOString();
    status.polls = Number(status.polls ?? 0) + 1;
    status.lastError = null;
    if (status.state !== "processing") status.state = "idle";

    const command = (snapshot.controlCommands ?? []).find((item) =>
      (item.status === "queued"
        || (item.status === "claimed" && item.claimedBy === CLOUD_WORKER))
      && item.actionType == null
      && item.requiresApproval !== true
      && item.status !== "awaiting_approval"
      && isSupportedCloudInstruction(item.instruction)
    );
    if (!command) return { processed: false, reason: "queue_empty" };

    status.state = "processing";
    status.currentCommandId = command.id;
    status.lastCommandId = command.id;
    const attempt = Math.max(1, Number(command.deliveryCount ?? 0) + 1);
    const result = await execute(command.id, { deliveryCount: attempt });
    status.currentCommandId = null;
    status.state = "idle";
    if (result?.outcome === "completed") {
      status.processedCommands = Number(status.processedCommands ?? 0) + 1;
      status.lastCompletedAt = new Date().toISOString();
    }
    return { processed: true, commandId: command.id, result };
  } catch (error) {
    status.currentCommandId = null;
    status.state = "degraded";
    status.lastError = safeErrorCode(error);
    throw error;
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Starts a single-process poller alongside the HTTP server on Render. */
export function startRenderWorker(options = {}) {
  const status = options.status ?? state;
  if (!isRenderRuntimeRequested()) {
    status.enabled = false;
    status.running = false;
    status.state = "disabled";
    return { stop() {}, done: Promise.resolve(), status: getRenderWorkerStatus };
  }
  status.enabled = true;
  if (!isRenderPollRuntime()) {
    status.running = false;
    status.state = "misconfigured";
    status.lastError = "render_runtime_requires_supabase";
    return { stop() {}, done: Promise.resolve(), status: getRenderWorkerStatus };
  }

  let stopped = false;
  let wake;
  const sleep = options.sleep ?? delay;
  const intervalMs = Math.max(500, Number(options.pollIntervalMs ?? process.env.ZOZ_PRO_WORKER_POLL_MS ?? DEFAULT_POLL_INTERVAL_MS));
  status.running = true;
  status.state = "starting";
  status.lastError = null;
  const done = (async () => {
    while (!stopped) {
      try {
        await pollRenderQueueOnce({ ...options, status });
      } catch (error) {
        console.error("ZOZ Pro Render worker poll failed", { code: safeErrorCode(error) });
      }
      if (!stopped) {
        await new Promise(resolve => {
          wake = resolve;
          Promise.resolve(sleep(intervalMs)).then(resolve);
        });
      }
    }
    status.running = false;
    status.state = "stopped";
    wake?.();
  })();
  return {
    stop() {
      stopped = true;
      wake?.();
    },
    done,
    status: getRenderWorkerStatus,
  };
}
