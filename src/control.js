import { requiresApproval, RISK_TYPES } from "./domain.js";

export const CONTROL_COMMAND_STATUSES = [
  "queued",
  "awaiting_approval",
  "claimed",
  "completed",
  "failed",
  "cancelled",
];

export function normalizeControlCommandInput(input = {}) {
  const instruction = typeof input.instruction === "string" ? input.instruction.trim() : "";
  const actionType = input.actionType ?? null;

  if (!instruction) throw new Error("instruction is required");
  if (instruction.length > 4000) throw new Error("instruction exceeds 4000 characters");
  if (actionType !== null && !RISK_TYPES.includes(actionType)) {
    throw new Error("unsupported actionType");
  }

  return {
    instruction,
    actionType,
    requiresApproval: actionType ? requiresApproval(actionType) : false,
  };
}

export function canTransitionControlCommand(from, to) {
  const transitions = {
    queued: new Set(["claimed", "cancelled"]),
    awaiting_approval: new Set(["queued", "cancelled"]),
    claimed: new Set(["completed", "failed", "cancelled"]),
    completed: new Set([]),
    failed: new Set([]),
    cancelled: new Set([]),
  };

  return Boolean(transitions[from]?.has(to));
}

export function assertControlCommandTransition(from, to) {
  if (!canTransitionControlCommand(from, to)) {
    throw new Error(`Invalid control command transition: ${from} -> ${to}`);
  }
}
