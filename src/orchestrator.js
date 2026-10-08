import { AGENT_ROLES, RISK_TYPES, assertTaskTransition, requiresApproval } from "./domain.js";

const DEFAULT_AGENT = "codex";

export function normalizeTaskAssignment(input = {}) {
  const taskId = typeof input.taskId === "string" ? input.taskId.trim() : "";
  const agent = typeof input.agent === "string" ? input.agent.trim() : DEFAULT_AGENT;
  const actor = typeof input.actor === "string" && input.actor.trim() ? input.actor.trim() : "CEO/Manager";

  if (!taskId) throw new Error("taskId is required");
  if (!AGENT_ROLES.some((role) => role.id === agent)) throw new Error("unsupported agent");

  return { taskId, agent, actor };
}

export function assignTask(task, input = {}) {
  const assignment = normalizeTaskAssignment({ ...input, taskId: input.taskId ?? task?.id });
  if (!task) throw new Error("task not found");
  if (task.status !== "planned") {
    throw new Error(`Only planned tasks may be assigned; current status is ${task.status}`);
  }

  assertTaskTransition(task.status, "assigned");

  return {
    ...task,
    assignedAgent: assignment.agent,
    assignedBy: assignment.actor,
    assignedAt: new Date().toISOString(),
    status: "assigned",
  };
}

export function evaluateExecutionGate({ task, actionType = null, approvalStatus = null } = {}) {
  if (!task) return { allowed: false, reason: "task_not_found" };
  if (task.status !== "assigned") {
    return { allowed: false, reason: `task_not_ready:${task.status}` };
  }
  if (task.assignedAgent !== DEFAULT_AGENT) {
    return { allowed: false, reason: "unsupported_execution_agent" };
  }
  if (actionType !== null && !RISK_TYPES.includes(actionType)) {
    return { allowed: false, reason: "unsupported_action_type" };
  }

  const protectedAction = actionType !== null && requiresApproval(actionType);
  if (protectedAction && approvalStatus !== "approved") {
    return {
      allowed: false,
      reason: "approval_required",
      approvalRequired: true,
    };
  }

  return {
    allowed: true,
    approvalRequired: protectedAction,
    safeAutonomy: !protectedAction,
    nextStatus: "executing",
  };
}

export function createExecutionDecision({ task, actionType = null, approvalStatus = null } = {}) {
  const gate = evaluateExecutionGate({ task, actionType, approvalStatus });

  return {
    taskId: task?.id ?? null,
    actionType,
    approvalStatus,
    ...gate,
    executor: gate.allowed ? DEFAULT_AGENT : null,
  };
}
