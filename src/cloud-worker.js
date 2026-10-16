import { randomUUID } from "node:crypto";
import { assertTaskTransition } from "./domain.js";
import { evaluateExecutionGate } from "./orchestrator.js";
import { createStateStore } from "./store.js";
import { withStateLock } from "./state-lock.js";
import { extractGeminiPrompt, generateGeminiText, GeminiAgentError } from "./gemini-agent.js";

export const CLOUD_SAFE_INSTRUCTIONS = Object.freeze([
  "system:health-check",
  "system:project-summary",
]);

const CLOUD_WORKER = "ZOZ Pro Cloud Worker";
const SAFE_INSTRUCTIONS = new Set(CLOUD_SAFE_INSTRUCTIONS);

export function normalizeCloudInstruction(value) {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/\s+/g, " ") : "";
}

export function isSupportedCloudInstruction(value) {
  return SAFE_INSTRUCTIONS.has(normalizeCloudInstruction(value)) || extractGeminiPrompt(value) !== null;
}

function timestamp(now) {
  return now().toISOString();
}

function appendActivity(state, type, taskId, message, now) {
  state.activity ??= [];
  state.activity.unshift({
    id: `act-${Date.now()}-${randomUUID().slice(0, 8)}`,
    timestamp: timestamp(now),
    type,
    actor: CLOUD_WORKER,
    taskId: taskId ?? null,
    message,
  });
}

function setExecutor(state, updates, now) {
  state.executor = {
    ...(state.executor ?? {}),
    id: "vercel-queue-worker",
    agent: CLOUD_WORKER,
    mode: "vercel_queue",
    protocol: "zoz-control-v1",
    capabilities: ["read-only-diagnostics", "gemini-text-generation"],
    lastSeen: timestamp(now),
    hostname: "vercel-serverless",
    ...updates,
  };
}

function makeResult(instruction, state, task, command) {
  const pendingApprovals = (state.approvals ?? []).filter(item => item.status === "pending").length;
  const queuedCommands = (state.controlCommands ?? []).filter(item => item.status === "queued").length;
  const counts = Object.fromEntries(
    ["planned", "assigned", "executing", "verification", "completed", "failed", "blocked"]
      .map(status => [status, (state.tasks ?? []).filter(item => item.status === status).length]),
  );

  if (normalizeCloudInstruction(instruction) === "system:health-check") {
    return [
      "ZOZ Pro cloud health check completed.",
      "Execution path: mobile control API -> durable state -> Vercel Queue -> cloud worker.",
      `Command ID: ${command.id}`,
      `Task ID: ${task.id}`,
      `Project: ${state.project.name} (${state.project.repository})`,
      `Tasks recorded: ${(state.tasks ?? []).length}`,
      `Pending owner approvals: ${pendingApprovals}`,
      `Queued commands before completion: ${queuedCommands}`,
      "External actions performed: none.",
    ].join("\n");
  }

  return [
    `ZOZ Pro project summary completed for command ${command.id}.`,
    `Project: ${state.project.name} (${state.project.repository})`,
    `Task ID: ${task.id}`,
    `Total tasks: ${(state.tasks ?? []).length}`,
    ...Object.entries(counts).map(([status, count]) => `Tasks ${status}: ${count}`),
    `Pending owner approvals: ${pendingApprovals}`,
    "This report is read-only; no external actions were performed.",
  ].join("\n");
}

async function failCommand(store, state, command, taskId, reason, now) {
  command.status = "failed";
  command.failedAt = timestamp(now);
  command.error = reason;
  setExecutor(state, {
    status: "idle",
    currentCommandId: null,
    lastError: reason,
  }, now);
  appendActivity(state, "control_command_failed", taskId, `${command.id} failed safely: ${reason}`, now);
  await store.save(state);
  return { outcome: "failed", commandId: command.id, taskId: taskId ?? null, reason };
}

/**
 * Process one allowlisted, deterministic, read-only command. Vercel Queue uses
 * at-least-once delivery, so claims and finalization are idempotent. A stale
 * Blob ETag conflict deliberately propagates so Queue can retry the delivery.
 */
async function processCloudCommandLocked(commandId, options = {}) {
  if (typeof commandId !== "string" || !commandId.trim()) {
    throw new Error("commandId is required");
  }
  const createStore = options.createStore ?? (() => createStateStore());
  const now = options.now ?? (() => new Date());
  const deliveryCount = Number.isInteger(options.deliveryCount) && options.deliveryCount > 0
    ? options.deliveryCount
    : 1;
  const store = createStore();
  let state = await store.load();
  let command = (state.controlCommands ?? []).find(item => item.id === commandId);

  if (!command) return { outcome: "skipped", reason: "command_not_found", commandId };
  if (["completed", "cancelled", "failed", "blocked"].includes(command.status)) {
    return { outcome: "skipped", reason: `command_${command.status}`, commandId };
  }

  // This generic cloud worker never executes approval-gated external actions.
  if (command.actionType || command.requiresApproval || command.status === "awaiting_approval") {
    return { outcome: "blocked", reason: "owner_approval_required", commandId };
  }

  const task = (state.tasks ?? []).find(item => item.id === command.taskId);
  if (!isSupportedCloudInstruction(command.instruction)) {
    return failCommand(store, state, command, task?.id, "cloud_instruction_not_supported", now);
  }
  if (!task) {
    return failCommand(store, state, command, null, "task_not_found", now);
  }

  if (command.status === "queued") {
    const gate = evaluateExecutionGate({ task, actionType: null, approvalStatus: null });
    if (!gate.allowed) {
      return failCommand(store, state, command, task.id, `cloud_execution_gate:${gate.reason}`, now);
    }

    assertTaskTransition(task.status, "executing");
    const startedAt = timestamp(now);
    command.status = "claimed";
    command.claimedAt = startedAt;
    command.claimedBy = CLOUD_WORKER;
    command.deliveryCount = deliveryCount;
    task.status = "executing";
    appendActivity(state, "control_command_claimed", task.id, `${command.id} claimed by the Vercel Queue worker.`, now);
    appendActivity(state, "task_executing", task.id, `${task.id} entered executing after ${command.id} was claimed.`, now);
    appendActivity(state, "executor_heartbeat", task.id, `Cloud worker heartbeat recorded while processing ${command.id}.`, now);
    setExecutor(state, {
      status: "online",
      currentCommandId: command.id,
      lastError: null,
      deliveryCount,
    }, now);
    await store.save(state);
  } else if (command.status === "claimed" && command.claimedBy === CLOUD_WORKER) {
    // Resume after a worker interruption. Only deterministic read-only work is
    // eligible for this path; no external side effect can be repeated.
    if (task.status !== "executing" || task.assignedAgent !== "codex") {
      return failCommand(store, state, command, task.id, "claimed_task_state_mismatch", now);
    }
    setExecutor(state, {
      status: "online",
      currentCommandId: command.id,
      lastError: null,
      deliveryCount,
    }, now);
    appendActivity(state, "executor_heartbeat", task.id, `Cloud worker resumed ${command.id} after redelivery.`, now);
    await store.save(state);
  } else {
    return { outcome: "skipped", reason: `command_${command.status}`, commandId };
  }

  // Read the durable claim back before execution and refresh the ETag. Queue
  // retries can then resume from persisted state rather than stale memory.
  state = await store.load();
  command = (state.controlCommands ?? []).find(item => item.id === commandId);
  if (!command || command.status !== "claimed" || command.claimedBy !== CLOUD_WORKER) {
    return { outcome: "skipped", reason: "claim_no_longer_owned", commandId };
  }
  const currentTask = (state.tasks ?? []).find(item => item.id === command.taskId);
  if (!currentTask || currentTask.status !== "executing") {
    return failCommand(store, state, command, currentTask?.id, "claimed_task_state_mismatch", now);
  }

  let result;
  try {
    const prompt = extractGeminiPrompt(command.instruction);
    result = prompt === null
      ? makeResult(command.instruction, state, currentTask, command)
      : await generateGeminiText(prompt, { ...(options.geminiOptions ?? {}), toolContext: { store, taskId: currentTask.id, commandId: command.id } });
  } catch (error) {
    const safeReason = error instanceof GeminiAgentError ? error.code : "cloud_agent_execution_failed";
    return failCommand(store, state, command, currentTask.id, safeReason, now);
  }

  // Finalize from a fresh durable read to avoid overwriting an intervening
  // owner action. A conflicting conditional write is retried by the queue.
  state = await store.load();
  command = (state.controlCommands ?? []).find(item => item.id === commandId);
  if (!command) return { outcome: "skipped", reason: "command_removed", commandId };
  if (command.status === "completed") return { outcome: "skipped", reason: "already_completed", commandId };
  if (command.status !== "claimed" || command.claimedBy !== CLOUD_WORKER) {
    return { outcome: "skipped", reason: "claim_no_longer_owned", commandId };
  }
  const finalTask = (state.tasks ?? []).find(item => item.id === command.taskId);
  if (!finalTask || finalTask.status !== "executing") {
    return failCommand(store, state, command, finalTask?.id, "claimed_task_state_mismatch", now);
  }

  assertTaskTransition(finalTask.status, "verification");
  finalTask.status = "verification";
  finalTask.result = result;
  command.status = "completed";
  command.completedAt = timestamp(now);
  command.result = result;
  command.error = null;
  setExecutor(state, {
    status: "idle",
    currentCommandId: null,
    lastError: null,
    lastCompletedCommandId: command.id,
    deliveryCount,
  }, now);
  appendActivity(state, "control_command_completed", finalTask.id, `${command.id} completed by the Vercel Queue worker.`, now);
  appendActivity(state, "task_moved_to_verification", finalTask.id, `${finalTask.id} moved to verification; task-level checks remain required.`, now);
  appendActivity(state, "executor_heartbeat", finalTask.id, "Cloud worker completion heartbeat recorded.", now);
  await store.save(state);

  return {
    outcome: "completed",
    commandId: command.id,
    taskId: finalTask.id,
    result,
    commandStatus: command.status,
    taskStatus: finalTask.status,
    workerStatus: state.executor.status,
    heartbeat: state.executor.lastSeen,
  };
}

// Serialize the cloud worker lifecycle with API mutations. The lease is renewed
// while the worker runs so long model responses cannot silently lose ownership.
export async function processCloudCommand(commandId, options = {}) {
  return withStateLock(() => processCloudCommandLocked(commandId, options));
}
