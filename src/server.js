import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertTaskTransition,
  createInitialState,
  requiresApproval,
} from "./domain.js";
import {
  assertControlCommandTransition,
  normalizeControlCommandInput,
  canExecuteControlCommand,
} from "./control.js";
import { createStateStore } from "./store.js";
import { normalizeOpportunityInput, normalizeIntelligenceInput, OPPORTUNITY_STATUSES } from "./opportunities.js";
import { normalizeContactInput, CONTACT_STATUSES } from "./crm.js";
import { normalizeOutreachInput, OUTREACH_STATUSES } from "./outreach.js";
import { isAuthorized, sendUnauthorized } from "./auth.js";
import { assertTaskCanReceiveCommand, normalizeTaskVerificationInput } from "./workflow.js";
import { assignTask, evaluateExecutionGate } from "./orchestrator.js";
import { getContentFactoryStatus } from "./content-factory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
const PORT = Number(process.env.PORT ?? 3000);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

function getStore() { return createStateStore(); }

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function appendActivity(state, activity) {
  state.activity.unshift({
    id: `act-${Date.now()}`,
    timestamp: new Date().toISOString(),
    ...activity,
  });
}

function createControlCommand(state, body) {
  const input = normalizeControlCommandInput(body);
  const taskId = body.taskId ?? state.project.currentTask;
  const task = state.tasks.find((item) => item.id === taskId);
  assertTaskCanReceiveCommand(task);
  if (task.status !== "assigned") {
    throw new Error(`Task ${task.id} must be explicitly assigned before a command can be created; current status is ${task.status}`);
  }
  const id = `CMD-${Date.now()}`;
  const command = {
    id,
    ...input,
    taskId,
    status: input.requiresApproval ? "awaiting_approval" : "queued",
    requestedBy: body.requestedBy ?? "Owner",
    createdAt: new Date().toISOString(),
    claimedAt: null,
    completedAt: null,
    result: null,
    error: null,
    approvalId: null,
  };

  if (input.requiresApproval) {
    const approval = {
      id: `APR-${Date.now()}-${id}`,
      taskId,
      commandId: id,
      actionType: input.actionType,
      status: "pending",
      requestedBy: command.requestedBy,
      decidedBy: null,
      decidedAt: null,
      reason: body.reason ?? "Mobile command requires explicit owner approval.",
    };
    command.approvalId = approval.id;
    state.approvals.unshift(approval);
    appendActivity(state, {
      type: "approval_requested",
      actor: approval.requestedBy,
      taskId: approval.taskId,
      message: `Approval requested for mobile command ${id}.`,
    });
  }

  return command;
}

async function handleApi(req, res, url) {
  const store = getStore();
  const state = await store.load();

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, {
      status: "ok",
      project: state.project.repository,
      controlPlane: "ready",
      queuedCommands: state.controlCommands?.filter((c) => c.status === "queued").length ?? 0,
    });
  }

  if (!isAuthorized(req)) return sendUnauthorized(res);

  if (req.method === "GET" && url.pathname === "/api/content-factory/status") {
    return sendJson(res, 200, getContentFactoryStatus({ state }));
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, state);
  }

  if (req.method === "GET" && url.pathname === "/api/outreach") {
    return sendJson(res, 200, { outreach: state.outreach ?? [] });
  }

  if (req.method === "POST" && url.pathname === "/api/outreach") {
    try {
      const item = normalizeOutreachInput(await readJson(req));
      if (!(state.contacts ?? []).some((contact) => contact.id === item.contactId)) {
        return sendJson(res, 400, { error:"contact not found" });
      }
      if (item.opportunityId && !(state.opportunities ?? []).some((opportunity) => opportunity.id === item.opportunityId)) {
        return sendJson(res, 400, { error:"opportunity not found" });
      }
      state.outreach ??= [];
      state.outreach.unshift(item);
      appendActivity(state, { type:"outreach_created", actor:"Owner", message:`Created outreach ${item.id} for ${item.contactId}; status remains ${item.status} until explicitly sent.` });
      await store.save(state);
      return sendJson(res, 201, item);
    } catch (error) { return sendJson(res, 400, { error:error.message }); }
  }

  const outreachMatch = url.pathname.match(/^\/api\/outreach\/([^/]+)\/status$/);
  if (req.method === "POST" && outreachMatch) {
    const id = decodeURIComponent(outreachMatch[1]);
    const item = (state.outreach ?? []).find((entry) => entry.id === id);
    if (!item) return sendJson(res, 404, { error:"outreach not found" });
    const body = await readJson(req);
    if (!OUTREACH_STATUSES.includes(body.status)) return sendJson(res, 400, { error:"invalid outreach status" });
    item.status = body.status;
    item.updatedAt = new Date().toISOString();
    if (body.status === "sent") item.lastAttemptAt = new Date().toISOString();
    appendActivity(state, { type:"outreach_status_changed", actor:"Owner", message:`${id}: ${body.status}` });
    await store.save(state);
    return sendJson(res, 200, item);
  }

  if (req.method === "GET" && url.pathname === "/api/contacts") {
    return sendJson(res, 200, { contacts: state.contacts ?? [] });
  }

  if (req.method === "POST" && url.pathname === "/api/contacts") {
    try {
      const contact = normalizeContactInput(await readJson(req));
      if (contact.linkedOpportunityId && !(state.opportunities ?? []).some((item) => item.id === contact.linkedOpportunityId)) {
        return sendJson(res, 400, { error:"linked opportunity not found" });
      }
      state.contacts ??= [];
      state.contacts.unshift(contact);
      appendActivity(state, { type:"contact_created", actor:"Owner", message:`Created contact ${contact.id}: ${contact.name}` });
      await store.save(state);
      return sendJson(res, 201, contact);
    } catch (error) { return sendJson(res, 400, { error:error.message }); }
  }

  const contactMatch = url.pathname.match(/^\/api\/contacts\/([^/]+)\/status$/);
  if (req.method === "POST" && contactMatch) {
    const id = decodeURIComponent(contactMatch[1]);
    const contact = (state.contacts ?? []).find((item) => item.id === id);
    if (!contact) return sendJson(res, 404, { error:"contact not found" });
    const body = await readJson(req);
    if (!CONTACT_STATUSES.includes(body.status)) return sendJson(res, 400, { error:"invalid contact status" });
    contact.status = body.status;
    contact.updatedAt = new Date().toISOString();
    appendActivity(state, { type:"contact_status_changed", actor:"Owner", message:`${id}: ${body.status}` });
    await store.save(state);
    return sendJson(res, 200, contact);
  }

  if (req.method === "GET" && url.pathname === "/api/opportunities") {
    return sendJson(res, 200, { opportunities: [...(state.opportunities ?? [])].sort((a,b) => b.score - a.score) });
  }

  if (req.method === "POST" && url.pathname === "/api/opportunities") {
    try {
      const opportunity = normalizeOpportunityInput(await readJson(req));
      state.opportunities ??= [];
      state.opportunities.unshift(opportunity);
      appendActivity(state, { type:"opportunity_created", actor:"Owner", message:`Created ${opportunity.id}: ${opportunity.title} (score ${opportunity.score})` });
      await store.save(state);
      return sendJson(res, 201, opportunity);
    } catch (error) { return sendJson(res, 400, { error:error.message }); }
  }

  const opportunityMatch = url.pathname.match(/^\/api\/opportunities\/([^/]+)\/status$/);
  if (req.method === "POST" && opportunityMatch) {
    const id = decodeURIComponent(opportunityMatch[1]);
    const opportunity = (state.opportunities ?? []).find((item) => item.id === id);
    if (!opportunity) return sendJson(res, 404, { error:"opportunity not found" });
    const body = await readJson(req);
    if (!OPPORTUNITY_STATUSES.includes(body.status)) return sendJson(res, 400, { error:"invalid opportunity status" });
    opportunity.status = body.status;
    opportunity.updatedAt = new Date().toISOString();
    appendActivity(state, { type:"opportunity_status_changed", actor:"Owner", message:`${id}: ${body.status}` });
    await store.save(state);
    return sendJson(res, 200, opportunity);
  }

  if (req.method === "GET" && url.pathname === "/api/intelligence") {
    return sendJson(res, 200, { intelligence: state.intelligence ?? [] });
  }

  if (req.method === "POST" && url.pathname === "/api/intelligence") {
    try {
      const signal = normalizeIntelligenceInput(await readJson(req));
      state.intelligence ??= [];
      state.intelligence.unshift(signal);
      appendActivity(state, { type:"intelligence_added", actor:"Owner", message:`Added ${signal.type} intelligence signal.` });
      await store.save(state);
      return sendJson(res, 201, signal);
    } catch (error) { return sendJson(res, 400, { error:error.message }); }
  }

  if (req.method === "GET" && url.pathname === "/api/control/commands") {
    return sendJson(res, 200, { commands: state.controlCommands ?? [] });
  }

  if (req.method === "GET" && url.pathname === "/api/executor/status") {
    return sendJson(res, 200, state.executor ?? {
      agent: "Codex", status: "offline", lastSeen: null, hostname: null,
      currentCommandId: null, lastError: null,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/executor/heartbeat") {
    const body = await readJson(req);
    state.executor = {
      agent: "Codex",
      status: "online",
      lastSeen: new Date().toISOString(),
      hostname: typeof body.hostname === "string" ? body.hostname : null,
      currentCommandId: body.currentCommandId ?? null,
      lastError: body.lastError ?? null,
    };
    await store.save(state);
    return sendJson(res, 200, state.executor);
  }

  if (req.method === "POST" && url.pathname === "/api/control/commands") {
    try {
      const command = createControlCommand(state, await readJson(req));
      state.controlCommands ??= [];
      state.controlCommands.unshift(command);
      appendActivity(state, {
        type: "control_command_created",
        actor: command.requestedBy,
        taskId: command.taskId,
        message: `${command.id} queued for Codex: ${command.instruction}`,
      });
      await store.save(state);
      return sendJson(res, 201, command);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  const commandMatch = url.pathname.match(/^\/api\/control\/commands\/([^/]+)\/(claim|complete|fail|cancel)$/);
  if (req.method === "POST" && commandMatch) {
    const commandId = decodeURIComponent(commandMatch[1]);
    const action = commandMatch[2];
    const command = (state.controlCommands ?? []).find((item) => item.id === commandId);
    if (!command) return sendJson(res, 404, { error: "command not found" });

    const target = {
      claim: "claimed",
      complete: "completed",
      fail: "failed",
      cancel: "cancelled",
    }[action];

    const task = state.tasks.find((item) => item.id === command.taskId);
    const approvalStatus = command.approvalId
      ? state.approvals.find((item) => item.id === command.approvalId)?.status ?? null
      : null;

    if (action === "claim") {
      const gate = evaluateExecutionGate({
        task,
        actionType: command.actionType,
        approvalStatus,
      });
      if (!gate.allowed) {
        return sendJson(res, 409, { error: gate.reason, approvalRequired: gate.approvalRequired ?? false });
      }
    }

    if (action === "complete" && task && task.status !== "verification") {
      return sendJson(res, 409, {
        error: "task_not_ready_for_command_completion",
        message: "The task must reach verification before the command can be marked completed.",
      });
    }

    try {
      assertControlCommandTransition(command.status, target);
    } catch (error) {
      return sendJson(res, 409, { error: error.message });
    }

    const body = await readJson(req);
    command.status = target;
    if (target === "claimed") {
      command.claimedAt = new Date().toISOString();
      assertTaskTransition(task.status, "executing");
      task.status = "executing";
      appendActivity(state, {
        type: "task_executing",
        actor: body.actor ?? "Codex Executor",
        taskId: task.id,
        message: `${task.id} entered executing after command ${command.id} was claimed.`,
      });
    }
    if (target === "completed") {
      command.completedAt = new Date().toISOString();
      command.result = typeof body.result === "string" ? body.result : "Completed";
    }
    if (target === "failed") {
      command.error = typeof body.error === "string" ? body.error : "Failed";
      if (task && ["assigned", "executing", "verification"].includes(task.status)) {
        assertTaskTransition(task.status, "failed");
        task.status = "failed";
        task.result = command.error;
      }
    }
    if (target === "cancelled") command.cancelledAt = new Date().toISOString();
    appendActivity(state, {
      type: `control_command_${target}`,
      actor: body.actor ?? "Codex",
      taskId: command.taskId,
      message: `${command.id}: ${target}`,
    });
    await store.save(state);
    return sendJson(res, 200, command);
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJson(req);
    if (!body.title || typeof body.title !== "string") {
      return sendJson(res, 400, { error: "title is required" });
    }
    const id = body.id ?? `ZP-${String(state.tasks.length + 1).padStart(3, "0")}`;
    if (state.tasks.some((item) => item.id === id)) {
      return sendJson(res, 409, { error: "task id already exists" });
    }
    const task = {
      id,
      title: body.title.trim(),
      owner: body.owner ?? "CEO/Manager",
      assignedAgent: body.assignedAgent ?? "codex",
      branch: body.branch ?? `task/${id.toLowerCase()}-task`,
      status: "planned",
      requiredChecks: Array.isArray(body.requiredChecks) ? body.requiredChecks : ["build", "tests"],
      result: null,
    };
    state.tasks.unshift(task);
    appendActivity(state, {
      type: "task_created",
      actor: "CEO/Manager",
      taskId: id,
      message: `Created ${id}: ${task.title}`,
    });
    await store.save(state);
    return sendJson(res, 201, task);
  }

  const assignMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/assign$/);
  if (req.method === "POST" && assignMatch) {
    const taskId = decodeURIComponent(assignMatch[1]);
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return sendJson(res, 404, { error: "task not found" });
    try {
      const body = await readJson(req);
      const assigned = assignTask(task, { taskId, agent: body.agent, actor: body.actor });
      Object.assign(task, assigned);
      appendActivity(state, {
        type: "task_assigned",
        actor: task.assignedBy,
        taskId,
        message: `${taskId} assigned to ${task.assignedAgent}.`,
      });
      await store.save(state);
      return sendJson(res, 200, task);
    } catch (error) {
      return sendJson(res, 409, { error: error.message });
    }
  }
  const verifyMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/verify$/);
  if (req.method === "POST" && verifyMatch) {
    const taskId = decodeURIComponent(verifyMatch[1]);
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return sendJson(res, 404, { error: "task not found" });
    const body = await readJson(req);
    const verification = normalizeTaskVerificationInput(task, body);
    if (!verification.passed) {
      task.status = "failed";
      task.result = `Verification failed: ${verification.failedChecks.join(", ") || verification.missingChecks.join(", ")}`;
      state.project.testsFailed = [...new Set([...(state.project.testsFailed ?? []), ...verification.failedChecks, ...verification.missingChecks])];
      appendActivity(state, {
        type: "task_verification_failed",
        actor: verification.verifiedBy,
        taskId,
        message: task.result,
      });
      await store.save(state);
      return sendJson(res, 409, { error: "verification_failed", verification, task });
    }
    if (task.status !== "verification") {
      return sendJson(res, 409, { error: `task must be in verification status, currently ${task.status}` });
    }
    task.status = "completed";
    task.result = verification.evidence || `Verified commit ${verification.commitSha || "unknown"}`;
    state.project.lastVerifiedCommit = verification.commitSha || state.project.lastVerifiedCommit;
    state.project.testsPassed = [...new Set([...(state.project.testsPassed ?? []), ...task.requiredChecks])];
    state.project.nextAllowedAction = "Create the next task only after reviewing the completed ZP-006 audit trail.";
    appendActivity(state, {
      type: "task_verified",
      actor: verification.verifiedBy,
      taskId,
      message: `Task verified and completed. commit=${verification.commitSha || "unknown"}`,
    });
    await store.save(state);
    return sendJson(res, 200, { task, verification });
  }

  const transitionMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/transition$/);
  if (req.method === "POST" && transitionMatch) {
    const taskId = decodeURIComponent(transitionMatch[1]);
    const body = await readJson(req);
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return sendJson(res, 404, { error: "task not found" });

    const actionType = body.actionType ?? null;
    if (actionType && requiresApproval(actionType)) {
      const approval = state.approvals.find(
        (item) => item.taskId === taskId && item.actionType === actionType && item.status === "approved",
      );
      if (!approval) {
        return sendJson(res, 409, {
          error: "approval_required",
          message: `Explicit owner approval is required for ${actionType}.`,
        });
      }
    }

    try {
      assertTaskTransition(task.status, body.status);
    } catch (error) {
      return sendJson(res, 409, { error: error.message });
    }
    task.status = body.status;
    if (typeof body.result === "string") task.result = body.result;
    appendActivity(state, {
      type: "task_transition",
      actor: body.actor ?? "Codex",
      taskId,
      message: `${taskId}: ${body.status}`,
    });
    await store.save(state);
    return sendJson(res, 200, task);
  }

  if (req.method === "POST" && url.pathname === "/api/approvals") {
    const body = await readJson(req);
    if (!body.taskId || !body.actionType || !requiresApproval(body.actionType)) {
      return sendJson(res, 400, { error: "taskId and a supported risk actionType are required" });
    }
    if (!state.tasks.some((item) => item.id === body.taskId)) {
      return sendJson(res, 404, { error: "task not found" });
    }
    const approval = {
      id: `APR-${Date.now()}`,
      taskId: body.taskId,
      actionType: body.actionType,
      status: "pending",
      requestedBy: body.requestedBy ?? "CEO/Manager",
      decidedBy: null,
      decidedAt: null,
      reason: body.reason ?? null,
    };
    state.approvals.unshift(approval);
    appendActivity(state, {
      type: "approval_requested",
      actor: approval.requestedBy,
      taskId: approval.taskId,
      message: `Approval requested for ${approval.actionType}.`,
    });
    await store.save(state);
    return sendJson(res, 201, approval);
  }

  const approvalMatch = url.pathname.match(/^\/api\/approvals\/([^/]+)\/(approve|reject)$/);
  if (req.method === "POST" && approvalMatch) {
    const approvalId = decodeURIComponent(approvalMatch[1]);
    const decision = approvalMatch[2];
    const body = await readJson(req);
    const approval = state.approvals.find((item) => item.id === approvalId);
    if (!approval) return sendJson(res, 404, { error: "approval not found" });
    if (approval.status !== "pending") return sendJson(res, 409, { error: "approval already decided" });

    approval.status = decision === "approve" ? "approved" : "rejected";
    approval.decidedBy = body.decidedBy ?? "Owner";
    approval.decidedAt = new Date().toISOString();
    appendActivity(state, {
      type: `approval_${approval.status}`,
      actor: approval.decidedBy,
      taskId: approval.taskId,
      message: `${approval.actionType} approval ${approval.status}.`,
    });

    const command = (state.controlCommands ?? []).find(
      (item) => item.approvalId === approval.id && item.status === "awaiting_approval",
    );
    if (command && approval.status === "approved") {
      command.status = "queued";
      appendActivity(state, {
        type: "control_command_released",
        actor: approval.decidedBy,
        taskId: command.taskId,
        message: `${command.id} released to Codex after explicit owner approval.`,
      });
    }
    if (command && approval.status === "rejected") {
      command.status = "cancelled";
      command.cancelledAt = new Date().toISOString();
      command.error = "Owner rejected approval.";
      appendActivity(state, {
        type: "control_command_cancelled",
        actor: approval.decidedBy,
        taskId: command.taskId,
        message: `${command.id} cancelled because owner rejected approval.`,
      });
    }

    await store.save(state);
    return sendJson(res, 200, approval);
  }

  return sendJson(res, 404, { error: "API route not found" });
}

async function serveStatic(req, res, url) {
  const relative = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = path.resolve(publicDir, relative);
  if (!filePath.startsWith(publicDir + path.sep)) {
    return sendJson(res, 400, { error: "invalid path" });
  }
  try {
    const body = await fs.readFile(filePath);
    const type = CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") return sendJson(res, 404, { error: "not found" });
    throw error;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "internal_server_error" });
  }
});

if (process.env.NODE_ENV !== "test") {
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`ZOZ Pro listening on http://0.0.0.0:${PORT}`);
  });
}

export { server, createInitialState };
