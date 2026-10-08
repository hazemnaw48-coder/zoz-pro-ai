export const EXECUTABLE_TASK_STATUSES = ["planned", "assigned", "executing", "verification"];

export function isExecutableTaskStatus(status) {
  return EXECUTABLE_TASK_STATUSES.includes(status);
}

export function assertTaskCanReceiveCommand(task) {
  if (!task) throw new Error("task not found");
  if (["completed", "failed", "blocked"].includes(task.status)) {
    throw new Error(`task ${task.id} is not executable from status ${task.status}`);
  }
  if (task.assignedAgent !== "codex") {
    throw new Error("Only the Codex coding agent may execute implementation commands.");
  }
}

export function normalizeTaskVerificationInput(task, input = {}) {
  if (!task) throw new Error("task not found");
  const checks = input.checks && typeof input.checks === "object" && !Array.isArray(input.checks)
    ? input.checks
    : {};
  const failedChecks = task.requiredChecks.filter((check) => checks[check] === false);
  const missingChecks = task.requiredChecks.filter((check) => checks[check] !== true);

  return {
    passed: input.passed === true && failedChecks.length === 0 && missingChecks.length === 0,
    checks,
    failedChecks,
    missingChecks,
    evidence: typeof input.evidence === "string" ? input.evidence.slice(0, 12000) : "",
    commitSha: typeof input.commitSha === "string" ? input.commitSha.trim() : "",
    verifiedBy: typeof input.verifiedBy === "string" && input.verifiedBy.trim()
      ? input.verifiedBy.trim()
      : "Codex Executor",
  };
}
