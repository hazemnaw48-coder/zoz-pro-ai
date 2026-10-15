import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStateStore } from "../src/store.js";
import { isSupportedCloudInstruction, processCloudCommand } from "../src/cloud-worker.js";
import { server } from "../src/server.js";

const ENV_KEYS = ["ZOZ_DATA_DIR", "ZOZ_CONTROL_TOKEN", "VERCEL", "VERCEL_ENV", "ZOZ_PRO_STORAGE_MODE", "NODE_ENV", "GEMINI_API_KEY", "GEMINI_MODEL"];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map(key => [key, process.env[key]]));
}
function restoreEnv(previous) {
  for (const key of ENV_KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}
async function post(base, route, headers, body) {
  return fetch(base + route, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("cloud worker executes a safe mobile command and persists result, heartbeat, and audit across requests", async () => {
  const previous = snapshotEnv();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-cloud-worker-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-cloud-control-token";
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.ZOZ_PRO_STORAGE_MODE;

  try {
    await createStateStore().load();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const headers = { authorization: "Bearer test-cloud-control-token" };

    const taskResponse = await post(base, "/api/tasks", headers, {
      id: "ZP-CLOUD-SMOKE",
      title: "Safe cloud worker smoke test",
      assignedAgent: "codex",
      requiredChecks: ["result", "persistence", "audit"],
    });
    assert.equal(taskResponse.status, 201);
    const task = await taskResponse.json();

    const assignmentResponse = await post(base, "/api/tasks/ZP-CLOUD-SMOKE/assign", headers, {
      agent: "codex",
      actor: "Owner",
    });
    assert.equal(assignmentResponse.status, 200);

    const commandResponse = await post(base, "/api/control/commands", headers, {
      taskId: task.id,
      instruction: "system:health-check",
      requestedBy: "Owner",
    });
    assert.equal(commandResponse.status, 201);
    const command = await commandResponse.json();
    assert.equal(command.status, "queued");

    const execution = await processCloudCommand(command.id, { deliveryCount: 1 });
    assert.equal(execution.outcome, "completed");
    assert.equal(execution.commandStatus, "completed");
    assert.equal(execution.taskStatus, "verification");
    assert.equal(execution.workerStatus, "idle");
    assert.match(execution.result, /External actions performed: none/);

    // This is a separate HTTP request and a new store instance, not the
    // worker's in-memory object.
    const stateResponse = await fetch(base + "/api/state", { headers });
    assert.equal(stateResponse.status, 200);
    const persistedFromRequest = await stateResponse.json();
    const persistedCommand = persistedFromRequest.controlCommands.find(item => item.id === command.id);
    assert.equal(persistedCommand.status, "completed");
    assert.match(persistedCommand.result, new RegExp(command.id));
    assert.equal(persistedFromRequest.tasks.find(item => item.id === task.id).status, "verification");
    assert.equal(persistedFromRequest.executor.mode, "vercel_queue");
    assert.equal(persistedFromRequest.executor.status, "idle");
    assert.ok(Date.parse(persistedFromRequest.executor.lastSeen));
    assert.ok(persistedFromRequest.activity.some(item => item.type === "control_command_claimed" && item.message.includes(command.id)));
    assert.ok(persistedFromRequest.activity.some(item => item.type === "control_command_completed" && item.message.includes(command.id)));
    assert.ok(persistedFromRequest.activity.some(item => item.type === "executor_heartbeat"));

    await new Promise(resolve => server.close(resolve));
    const afterWorkerRestart = await createStateStore().load();
    assert.equal(afterWorkerRestart.controlCommands.find(item => item.id === command.id).status, "completed");
    assert.equal(afterWorkerRestart.controlCommands.find(item => item.id === command.id).result, persistedCommand.result);
    assert.ok(afterWorkerRestart.activity.some(item => item.type === "control_command_completed" && item.message.includes(command.id)));
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    restoreEnv(previous);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cloud worker sends a text-only Gemini task to the model and persists the returned work product", async () => {
  const previous = snapshotEnv();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-gemini-worker-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.ZOZ_PRO_STORAGE_MODE;
  try {
    const store = createStateStore();
    const state = await store.load();
    state.tasks.unshift({
      id: "ZP-GEMINI-TEST",
      title: "Gemini text task test",
      owner: "Owner",
      assignedAgent: "codex",
      branch: "task/gemini-test",
      status: "planned",
      requiredChecks: ["result", "persistence", "audit"],
      result: null,
    });
    state.controlCommands.unshift({
      id: "CMD-GEMINI-TEST",
      taskId: "ZP-GEMINI-TEST",
      instruction: "gemini:assist: اكتب مقدمة عربية قصيرة لفيديو أطفال عن القمر",
      actionType: null,
      requiresApproval: false,
      status: "queued",
      requestedBy: "Owner",
      result: null,
      error: null,
    });
    await store.save(state);

    let requestBody;
    const result = await processCloudCommand("CMD-GEMINI-TEST", {
      geminiOptions: {
        env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-2.5-flash" },
        timeoutMs: 2000,
        fetchImpl: async (_url, options) => {
          requestBody = JSON.parse(options.body);
          return {
            ok: true,
            status: 200,
            json: async () => ({ candidates: [{ content: { parts: [{ text: "مقدمة عربية تجريبية للفيديو." }] } }] }),
          };
        },
      },
    });
    assert.equal(result.outcome, "completed");
    assert.equal(result.taskStatus, "verification");
    assert.equal(result.result, "مقدمة عربية تجريبية للفيديو.");
    assert.match(requestBody.contents[0].parts[0].text, /فيديو أطفال عن القمر/);

    const persisted = await createStateStore().load();
    assert.equal(persisted.controlCommands.find(item => item.id === "CMD-GEMINI-TEST").status, "completed");
    assert.equal(persisted.tasks.find(item => item.id === "ZP-GEMINI-TEST").result, "مقدمة عربية تجريبية للفيديو.");
    assert.ok(persisted.activity.some(item => item.type === "control_command_completed" && item.message.includes("CMD-GEMINI-TEST")));
  } finally {
    restoreEnv(previous);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cloud worker records a safe failure when Gemini is not configured", async () => {
  const previous = snapshotEnv();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-gemini-missing-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.ZOZ_PRO_STORAGE_MODE;
  delete process.env.GEMINI_API_KEY;
  try {
    const store = createStateStore();
    const state = await store.load();
    state.tasks.unshift({
      id: "ZP-GEMINI-MISSING",
      title: "Gemini missing key test",
      owner: "Owner",
      assignedAgent: "codex",
      branch: "task/gemini-missing",
      status: "planned",
      requiredChecks: [],
      result: null,
    });
    state.controlCommands.unshift({
      id: "CMD-GEMINI-MISSING",
      taskId: "ZP-GEMINI-MISSING",
      instruction: "gemini:assist: اكتب ملخصًا",
      actionType: null,
      requiresApproval: false,
      status: "queued",
      requestedBy: "Owner",
      result: null,
      error: null,
    });
    await store.save(state);
    const result = await processCloudCommand("CMD-GEMINI-MISSING");
    assert.equal(result.outcome, "failed");
    assert.equal(result.reason, "gemini_not_configured");
    const persisted = await createStateStore().load();
    assert.equal(persisted.tasks.find(item => item.id === "ZP-GEMINI-MISSING").status, "failed");
    assert.equal(persisted.controlCommands.find(item => item.id === "CMD-GEMINI-MISSING").status, "failed");
  } finally {
    restoreEnv(previous);
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("cloud worker allowlist is read-only and rejects unrecognized instructions", () => {
  assert.equal(isSupportedCloudInstruction("system:health-check"), true);
  assert.equal(isSupportedCloudInstruction(" SYSTEM:PROJECT-SUMMARY "), true);
  assert.equal(isSupportedCloudInstruction("delete production data"), false);
  assert.equal(isSupportedCloudInstruction("send a WhatsApp message"), false);
});

test("cloud worker never executes approval-gated commands", async () => {
  const previous = snapshotEnv();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-cloud-risk-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.NODE_ENV = "test";
  delete process.env.VERCEL;
  delete process.env.VERCEL_ENV;
  delete process.env.ZOZ_PRO_STORAGE_MODE;
  try {
    const store = createStateStore();
    const state = await store.load();
    state.controlCommands.unshift({
      id: "CMD-CLOUD-RISK-TEST",
      taskId: "ZP-006",
      instruction: "Send a WhatsApp message",
      actionType: "external_send",
      requiresApproval: true,
      status: "awaiting_approval",
      approvalId: "APR-CLOUD-RISK-TEST",
      result: null,
      error: null,
    });
    state.approvals.unshift({
      id: "APR-CLOUD-RISK-TEST",
      taskId: "ZP-006",
      commandId: "CMD-CLOUD-RISK-TEST",
      actionType: "external_send",
      status: "pending",
    });
    await store.save(state);

    const result = await processCloudCommand("CMD-CLOUD-RISK-TEST");
    assert.equal(result.outcome, "blocked");
    assert.equal(result.reason, "owner_approval_required");

    const persisted = await createStateStore().load();
    assert.equal(persisted.controlCommands[0].status, "awaiting_approval");
    assert.equal(persisted.controlCommands[0].result, null);
    assert.equal(persisted.approvals[0].status, "pending");
  } finally {
    restoreEnv(previous);
    await fs.rm(dir, { recursive: true, force: true });
  }
});
