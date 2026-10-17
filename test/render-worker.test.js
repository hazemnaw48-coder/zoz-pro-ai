import test from "node:test";
import assert from "node:assert/strict";
import { pollRenderQueueOnce } from "../src/render-worker.js";

function mockState(commands) {
  return {
    controlCommands: commands,
    tasks: [],
    approvals: [],
    activity: [],
    project: { name: "ZOZ Pro", repository: "hazemnaw48-coder/zoz-pro-ai" },
  };
}

test("Render poller executes one persisted safe command and records worker health", async () => {
  const status = { polls: 0, processedCommands: 0, state: "idle" };
  let receivedId = null;
  const store = { load: async () => mockState([
    { id: "CMD-1", status: "queued", instruction: "system:health-check", actionType: null, requiresApproval: false },
    { id: "CMD-2", status: "queued", instruction: "system:project-summary", actionType: "external_send", requiresApproval: true },
  ]) };
  const result = await pollRenderQueueOnce({
    status,
    createStore: () => store,
    processCommand: async (id, options) => {
      receivedId = id;
      assert.equal(options.deliveryCount, 1);
      return { outcome: "completed", commandId: id };
    },
  });
  assert.equal(result.processed, true);
  assert.equal(receivedId, "CMD-1");
  assert.equal(status.polls, 1);
  assert.equal(status.processedCommands, 1);
  assert.equal(status.state, "idle");
  assert.equal(status.currentCommandId, null);
  assert.ok(status.lastCompletedAt);
});

test("Render poller leaves queue empty when only approval-gated commands exist", async () => {
  const status = { polls: 0, processedCommands: 0, state: "idle" };
  const store = { load: async () => mockState([
    { id: "CMD-APPROVAL", status: "queued", instruction: "system:health-check", actionType: "external_send", requiresApproval: true },
    { id: "CMD-UNSAFE", status: "queued", instruction: "run arbitrary shell command", actionType: null, requiresApproval: false },
  ]) };
  const result = await pollRenderQueueOnce({
    status,
    createStore: () => store,
    processCommand: async () => { throw new Error("unsafe command must never execute"); },
  });
  assert.deepEqual(result, { processed: false, reason: "queue_empty" });
  assert.equal(status.polls, 1);
  assert.equal(status.processedCommands, 0);
});

test("Render poller reports safe failure codes without leaking raw error messages", async () => {
  const status = { polls: 0, processedCommands: 0, state: "idle" };
  const store = { load: async () => { throw Object.assign(new Error("private connection string"), { code: "supabase_unavailable" }); } };
  await assert.rejects(
    pollRenderQueueOnce({ status, createStore: () => store }),
    /private connection string/,
  );
  assert.equal(status.state, "degraded");
  assert.equal(status.lastError, "supabase_unavailable");
});
