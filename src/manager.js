export function summarizeSystem(state) {
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const approvals = Array.isArray(state.approvals) ? state.approvals : [];
  const commands = Array.isArray(state.controlCommands) ? state.controlCommands : [];
  const failedTasks = tasks.filter((task) => task.status === "failed");
  const blockedTasks = tasks.filter((task) => task.status === "blocked");
  const pendingApprovals = approvals.filter((approval) => approval.status === "pending");
  const queuedCommands = commands.filter((command) => command.status === "queued");
  const executor = state.executor ?? { status: "offline" };

  const alerts = [];
  if (failedTasks.length) alerts.push(`${failedTasks.length} failed task(s) require review.`);
  if (blockedTasks.length) alerts.push(`${blockedTasks.length} blocked task(s) require a decision.`);
  if (pendingApprovals.length) alerts.push(`${pendingApprovals.length} approval request(s) are waiting for the owner.`);
  if (queuedCommands.length && executor.status !== "online") {
    alerts.push("Commands are queued while the Codex executor is offline.");
  }

  const status = failedTasks.length || blockedTasks.length
    ? "attention"
    : pendingApprovals.length || queuedCommands.length
      ? "active"
      : executor.status === "online"
        ? "healthy"
        : "ready";

  const workAreas = (state.workAreas ?? []).map((area) => {
    const areaTasks = tasks.filter((task) => task.workAreaId === area.id);
    return {
      ...area,
      totalTasks: areaTasks.length,
      activeTasks: areaTasks.filter((task) => !["completed", "failed"].includes(task.status)).length,
      completedTasks: areaTasks.filter((task) => task.status === "completed").length,
      failedTasks: areaTasks.filter((task) => task.status === "failed").length,
    };
  });

  return {
    manager: "ZOZ Pro Technical Manager",
    status,
    mode: state.settings?.localMode ? "local-first" : "remote",
    deployment: state.project?.deploymentStatus ?? "unknown",
    executor: {
      agent: executor.agent ?? "Codex",
      status: executor.status ?? "offline",
      hostname: executor.hostname ?? null,
      lastSeen: executor.lastSeen ?? null,
      currentCommandId: executor.currentCommandId ?? null,
      lastError: executor.lastError ?? null,
    },
    counts: {
      tasks: tasks.length,
      activeTasks: tasks.filter((task) => !["completed", "failed"].includes(task.status)).length,
      failedTasks: failedTasks.length,
      blockedTasks: blockedTasks.length,
      pendingApprovals: pendingApprovals.length,
      queuedCommands: queuedCommands.length,
    },
    workAreas,
    alerts,
    policy: {
      autoDeploy: Boolean(state.settings?.autoDeploy),
      concurrentCodingAgents: state.settings?.concurrentCodingAgents ?? 1,
      approvalRequiredForRiskTypes: state.settings?.approvalRequiredForRiskTypes ?? [],
      externalOrDestructiveActionsRequireOwnerApproval: true,
      managerMayAutoExecuteRiskyActions: false,
    },
    nextAction: alerts[0] ?? state.project?.nextAllowedAction ?? "No action required.",
  };
}
