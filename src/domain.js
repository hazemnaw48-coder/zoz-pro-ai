export const TASK_STATUSES = [
  "planned",
  "assigned",
  "executing",
  "verification",
  "completed",
  "failed",
  "blocked",
];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"];

export const RISK_TYPES = [
  "financial",
  "destructive",
  "external_send",
  "irreversible",
  "production_affecting",
  "credential_affecting",
  "account_affecting",
];

export const AGENT_ROLES = [
  {
    id: "codex",
    name: "Codex",
    role: "Primary implementer",
    writeAccess: "Assigned task branch only",
  },
  {
    id: "claude-code",
    name: "Claude Code",
    role: "Reviewer / tester",
    writeAccess: "Read-only unless explicitly assigned",
  },
  {
    id: "gemini-cli",
    name: "Gemini CLI",
    role: "Second reviewer / issue discovery",
    writeAccess: "Read-only unless explicitly assigned",
  },
  {
    id: "paperclip",
    name: "Paperclip",
    role: "Agent/task coordinator",
    writeAccess: "No parallel coding on an active Codex task",
  },
];

export function requiresApproval(actionType) {
  return RISK_TYPES.includes(actionType);
}

const ALLOWED_TRANSITIONS = {
  planned: new Set(["assigned", "blocked", "failed"]),
  assigned: new Set(["executing", "blocked", "failed"]),
  executing: new Set(["verification", "blocked", "failed"]),
  verification: new Set(["completed", "failed", "blocked"]),
  completed: new Set([]),
  failed: new Set([]),
  blocked: new Set(["planned", "assigned", "failed"]),
};

export function canTransitionTask(from, to) {
  if (!TASK_STATUSES.includes(from) || !TASK_STATUSES.includes(to)) return false;
  return ALLOWED_TRANSITIONS[from].has(to);
}

export function assertTaskTransition(from, to) {
  if (!canTransitionTask(from, to)) {
    throw new Error(`Invalid task transition: ${from} -> ${to}`);
  }
}

export function createInitialState() {
  return {
    schemaVersion: 4,
    project: {
      id: "ZOZ-PRO",
      name: "ZOZ Pro",
      type: "Business OS",
      repository: "hazemnaw48-coder/zoz-pro-ai",
      integrationBranch: "main",
      currentTask: "ZP-006",
      currentBranch: "task/zp-006-ceo-task-command-audit",
      lastVerifiedCommit: "de24795b263a790accb1f1f8d288c6c1370e37fb",
      filesChanged: [],
      testsPassed: [],
      testsFailed: [],
      blockedReason: null,
      nextAllowedAction: "Run ZP-006 through the explicit CEO → Task → Command → Codex → Verification → Audit workflow.",
      lastAgent: "Codex",
      lastReview: null,
      deploymentStatus: "not_deployed",
    },
    tasks: [
      {
        id: "ZP-001",
        title: "Foundation: application skeleton and durable project state",
        owner: "CEO/Manager",
        assignedAgent: "codex",
        branch: "task/ZP-001-foundation",
        status: "verification",
        requiredChecks: ["build", "tests", "persistence", "mobile-shell", "approval-model"],
        result: "Foundation implemented; awaiting verification.",
      },
      {
        id: "ZP-006",
        title: "Harden CEO → Task → Command → Codex → Result/Failure → Audit workflow",
        owner: "CEO/Manager",
        assignedAgent: "codex",
        branch: "task/zp-006-ceo-task-command-audit",
        status: "planned",
        requiredChecks: ["build", "tests", "workflow", "approval-gates", "audit"],
        result: null,
      },
    ],
    opportunities: [],
    intelligence: [],
    contacts: [],
    outreach: [],
    approvals: [],
    controlCommands: [],
    executor: {
      id: "codex",
      agent: "Codex",
      mode: "local_cli",
      protocol: "zoz-control-v1",
      capabilities: ["coding", "tests", "git"],
      status: "offline",
      lastSeen: null,
      hostname: null,
      currentCommandId: null,
      lastError: null,
    },
    activity: [
      {
        id: "act-001",
        timestamp: new Date().toISOString(),
        type: "task_started",
        actor: "Codex",
        taskId: "ZP-001",
        message: "ZP-001 started on task/ZP-001-foundation.",
      },
    ],
    agents: AGENT_ROLES,
    settings: {
      localMode: true,
      autoDeploy: false,
      concurrentCodingAgents: 1,
      approvalRequiredForRiskTypes: [...RISK_TYPES],
    },
  };
}

export function validateState(state) {
  if (!state || typeof state !== "object") throw new Error("State must be an object.");
  if (state.project?.repository !== "hazemnaw48-coder/zoz-pro-ai") {
    throw new Error("State repository boundary is invalid.");
  }
  if (state.project?.integrationBranch !== "main") {
    throw new Error("State integration branch must remain main.");
  }
  return true;
}
