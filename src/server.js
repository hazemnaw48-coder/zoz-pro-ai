import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVAL_STATUSES,
  assertTaskTransition,
  createInitialState,
  requiresApproval,
} from "./domain.js";
import { createStateStore } from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");
const store = createStateStore();
const PORT = Number(process.env.PORT ?? 3000);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

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

async function handleApi(req, res, url) {
  const state = await store.load();

  if (req.method === "GET" && url.pathname === "/api/health") {
    return sendJson(res, 200, { status: "ok", project: state.project.repository });
  }

  if (req.method === "GET" && url.pathname === "/api/state") {
    return sendJson(res, 200, state);
  }

  if (req.method === "POST" && url.pathname === "/api/tasks") {
    const body = await readJson(req);
    if (!body.title || typeof body.title !== "string") {
      return sendJson(res, 400, { error: "title is required" });
    }

    const id = body.id ?? `ZP-${String(state.tasks.length + 1).padStart(3, "0")}`;
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

  const transitionMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/transition$/);
  if (req.method === "POST" && transitionMatch) {
    const taskId = decodeURIComponent(transitionMatch[1]);
    const body = await readJson(req);
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) return sendJson(res, 404, { error: "task not found" });

    const actionType = body.actionType ?? null;
    if (actionType && requiresApproval(actionType)) {
      const approval = state.approvals.find(
        (item) =>
          item.taskId === taskId &&
          item.actionType === actionType &&
          item.status === "approved",
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
      return sendJson(res, 400, {
        error: "taskId and a supported risk actionType are required",
      });
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
    if (approval.status !== "pending") {
      return sendJson(res, 409, { error: "approval already decided" });
    }

    approval.status = decision === "approve" ? "approved" : "rejected";
    approval.decidedBy = body.decidedBy ?? "Owner";
    approval.decidedAt = new Date().toISOString();
    appendActivity(state, {
      type: `approval_${approval.status}`,
      actor: approval.decidedBy,
      taskId: approval.taskId,
      message: `${approval.actionType} approval ${approval.status}.`,
    });
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
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
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
