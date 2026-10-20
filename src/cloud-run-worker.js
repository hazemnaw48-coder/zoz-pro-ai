import { createStateStore } from "./store.js";
import { isCloudRunRuntimeRequested, isCloudRunSupabaseRuntime } from "./cloud-queue.js";
import { isSupportedCloudInstruction, normalizeCloudInstruction, processCloudCommand } from "./cloud-worker.js";

const CLOUD_WORKER = "ZOZ Pro Cloud Worker";
const MAX_SWEEP_COMMANDS = 10;
const inFlight = new Set();
const deterministicInstructions = new Set(["system:health-check", "system:project-summary"]);
const state = {
  enabled: false,
  running: false,
  state: "disabled",
  lastRunAt: null,
  lastCommandId: null,
  lastCompletedAt: null,
  currentCommandId: null,
  lastError: null,
  runs: 0,
  processedCommands: 0,
  recoveredCommands: 0,
};

function safeErrorCode(error) {
  const code = String(error?.code ?? error?.name ?? "cloud_run_worker_failed");
  return /^[a-zA-Z0-9_-]{1,80}$/.test(code) ? code : "cloud_run_worker_failed";
}

export function getCloudRunWorkerStatus() {
  return {
    ...state,
    enabled: isCloudRunRuntimeRequested(),
    configured: isCloudRunSupabaseRuntime(),
  };
}

/**
 * Execute a command in the HTTP request lifecycle. The state row is first
 * durably claimed by processCloudCommand before any work begins. The in-process
 * guard prevents a manual sweep and direct request from executing the same
 * command twice in one instance; Cloud Run should also use max-instances=1.
 */
export async function executeCloudRunCommand(commandId, options = {}) {
  if (!isCloudRunSupabaseRuntime()) {
    const error = new Error("Cloud Run worker is not configured for Supabase.");
    error.code = "cloud_run_misconfigured";
    throw error;
  }
  if (typeof commandId !== "string" || !commandId.trim()) {
    const error = new Error("commandId is required.");
    error.code = "command_id_required";
    throw error;
  }
  if (inFlight.has(commandId)) {
    return { outcome: "skipped", reason: "command_in_progress", commandId };
  }

  inFlight.add(commandId);
  state.enabled = true;
  state.running = true;
  state.state = "processing";
  state.currentCommandId = commandId;
  state.lastCommandId = commandId;
  state.lastRunAt = new Date().toISOString();
  state.runs += 1;
  state.lastError = null;

  try {
    const execute = options.processCommand ?? processCloudCommand;
    const result = await execute(commandId, options);
    if (result?.outcome === "completed") {
      state.processedCommands += 1;
      state.lastCompletedAt = new Date().toISOString();
    }
    return result;
  } catch (error) {
    state.state = "degraded";
    state.lastError = safeErrorCode(error);
    throw error;
  } finally {
    inFlight.delete(commandId);
    state.running = inFlight.size > 0;
    state.currentCommandId = inFlight.size ? [...inFlight][inFlight.size - 1] : null;
    if (!state.running && state.state !== "degraded") state.state = "idle";
  }
}

/**
 * Recover safely after a Cloud Run instance restart. Queued commands are
 * eligible only when allowlisted and not approval-gated. Already-claimed
 * commands are recovered automatically only for deterministic system checks;
 * a claimed Gemini request is left for inspection to avoid duplicate model cost.
 * This sweep runs only when the owner calls the authenticated POST
 * /api/worker/sweep endpoint. It does not poll continuously, run automatically
 * on health checks, or keep an instance alive while idle.
 */
export async function sweepCloudRunQueueOnce(options = {}) {
  if (!isCloudRunSupabaseRuntime()) {
    const error = new Error("Cloud Run worker is not configured for Supabase.");
    error.code = "cloud_run_misconfigured";
    throw error;
  }

  const createStore = options.createStore ?? (() => createStateStore());
  const store = createStore();
  const snapshot = await store.load();
  const rawLimit = Number(options.limit ?? process.env.ZOZ_PRO_WORKER_SWEEP_LIMIT ?? MAX_SWEEP_COMMANDS);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(MAX_SWEEP_COMMANDS, Math.floor(rawLimit))) : MAX_SWEEP_COMMANDS;
  const nowOption = options.now ?? (() => new Date());
  const nowValue = typeof nowOption === "function" ? nowOption() : nowOption;
  const nowMs = new Date(nowValue).getTime();
  const candidates = (snapshot.controlCommands ?? []).filter((command) => {
    const instruction = normalizeCloudInstruction(command.instruction);
    if (command.actionType != null || command.requiresApproval === true || command.status === "awaiting_approval") return false;
    if (!isSupportedCloudInstruction(command.instruction)) return false;
    if (command.status === "queued") {
      // A persisted retry timestamp is a hard eligibility gate. Missing timestamps
      // preserve legacy queued-command behavior; malformed timestamps fail closed.
      if (command.nextRetryAt != null && command.nextRetryAt !== "") {
        const retryAt = Date.parse(command.nextRetryAt);
        if (!Number.isFinite(retryAt) || !Number.isFinite(nowMs) || retryAt > nowMs) return false;
      }
      return true;
    }
    return command.status === "claimed"
      && command.claimedBy === CLOUD_WORKER
      && deterministicInstructions.has(instruction);
  }).slice(0, limit);

  const results = [];
  for (const command of candidates) {
    try {
      const wasClaimed = command.status === "claimed";
      const result = await executeCloudRunCommand(command.id, options);
      results.push({ commandId: command.id, outcome: result?.outcome ?? "unknown", reason: result?.reason ?? null });
      if (wasClaimed && result?.outcome === "completed") state.recoveredCommands += 1;
    } catch (error) {
      results.push({ commandId: command.id, outcome: "error", error: safeErrorCode(error) });
      // Do not continue with other state mutations after a failed write/read.
      break;
    }
  }

  return {
    runtime: "google-cloud-run-supabase-inband",
    checked: candidates.length,
    processed: results.filter((item) => item.outcome === "completed").length,
    pending: candidates.length - results.filter((item) => ["completed", "skipped", "failed", "blocked"].includes(item.outcome)).length,
    worker: getCloudRunWorkerStatus(),
    results,
  };
}
