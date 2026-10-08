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

export const WORK_AREAS = [
  { id: "executive", name: "Executive Control", description: "CEO decisions, priorities, approvals, policy, and company-wide control." },
  { id: "intelligence", name: "Opportunities & Intelligence", description: "Opportunity discovery, research, qualification, scoring, and market intelligence." },
  { id: "sales", name: "Sales & CRM", description: "Leads, contacts, opportunities, follow-up, pipeline, and customer progression." },
  { id: "marketing", name: "Marketing & Growth", description: "Content, SEO, campaigns, growth experiments, and performance tracking." },
  { id: "operations", name: "Operations & Delivery", description: "Projects, delivery workflows, process execution, and operational follow-through." },
  { id: "finance", name: "Finance & Governance", description: "Financial planning, cost tracking, controls, and owner-approved financial actions." },
  { id: "communications", name: "Communications", description: "Approved external communication workflows, records, and follow-up coordination." },
  { id: "product", name: "Product & Engineering", description: "Product development, coding, tests, releases, and technical reliability." },
];

export const WORK_AREA_IDS = WORK_AREAS.map((area) => area.id);

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
    schemaVersion: 2,
    project: {
      id: "ZOZ-PRO",
      name: "ZOZ Pro",
      type: "Business OS",
      repository: "hazemnaw48-coder/zoz-pro-ai",
      integrationBranch: "main",
      currentTask: "ZP-001",
      currentWorkArea: "product",
      currentBranch: "task/ZP-001-foundation",
      lastVerifiedCommit: "pending",
      filesChanged: [],
      testsPassed: [],
      testsFailed: [],
      blockedReason: null,
      nextAllowedAction: "Verify ZP-001 build and tests before starting ZP-002.",
      lastAgent: "Codex",
      lastReview: null,
      deploymentStatus: "not_deployed",
    },
    tasks: [
      {
        id: "ZP-001",
        title: "Foundation: application skeleton and durable project state",
        owner: "CEO/Manager",
        workAreaId: "product",
        assignedAgent: "codex",
        branch: "task/ZP-001-foundation",
        status: "verification",
        requiredChecks: ["build", "tests", "persistence", "mobile-shell", "approval-model"],
        result: "Foundation implemented; awaiting verification.",
      },
    ],
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
