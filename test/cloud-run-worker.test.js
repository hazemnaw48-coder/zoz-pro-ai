import test from "node:test";
import assert from "node:assert/strict";
import { executeCloudRunCommand, getCloudRunWorkerStatus, sweepCloudRunQueueOnce } from "../src/cloud-run-worker.js";

function withCloudRunEnv(fn) {
  const previous = {
    runtime: process.env.ZOZ_PRO_EXECUTION_RUNTIME,
    backend: process.env.ZOZ_PRO_STATE_BACKEND,
  };
  process.env.ZOZ_PRO_EXECUTION_RUNTIME = "cloud-run-inband";
  process.env.ZOZ_PRO_STATE_BACKEND = "supabase";
  return Promise.resolve().then(fn).finally(() => {
    if (previous.runtime === undefined) delete process.env.ZOZ_PRO_EXECUTION_RUNTIME;
    else process.env.ZOZ_PRO_EXECUTION_RUNTIME = previous.runtime;
    if (previous.backend === undefined) delete process.env.ZOZ_PRO_STATE_BACKEND;
    else process.env.ZOZ_PRO_STATE_BACKEND = previous.backend;
  });
}

test("Cloud Run worker refuses to run when Supabase runtime is not configured", async () => {
  await withCloudRunEnv(async () => {
    const previous = process.env.ZOZ_PRO_STATE_BACKEND;
    process.env.ZOZ_PRO_STATE_BACKEND = "file";
    await assert.rejects(() => executeCloudRunCommand("CMD-1", {
      processCommand: async () => { throw new Error("must not execute"); },
    }), (error) => error.code === "cloud_run_misconfigured");
    if (previous === undefined) delete process.env.ZOZ_PRO_STATE_BACKEND;
    else process.env.ZOZ_PRO_STATE_BACKEND = previous;
  });
});

test("Cloud Run sweep only dispatches allowlisted non-approval commands", async () => {
  await withCloudRunEnv(async () => {
    const snapshot = {
      controlCommands: [
        { id: "CMD-HEALTH", status: "queued", instruction: "system:health-check", actionType: null, requiresApproval: false },
        { id: "CMD-APPROVAL", status: "queued", instruction: "system:project-summary", actionType: "external_send", requiresApproval: true },
        { id: "CMD-UNSAFE", status: "queued", instruction: "run arbitrary shell", actionType: null, requiresApproval: false },
      ],
    };
    const executed = [];
    const result = await sweepCloudRunQueueOnce({
      createStore: () => ({ load: async () => snapshot }),
      processCommand: async (id) => {
        executed.push(id);
        return { outcome: "completed", commandId: id };
      },
    });
    assert.deepEqual(executed, ["CMD-HEALTH"]);
    assert.equal(result.runtime, "google-cloud-run-supabase-inband");
    assert.equal(result.checked, 1);
    assert.equal(result.processed, 1);
    assert.equal(getCloudRunWorkerStatus().configured, true);
  });
});

test("Cloud Run sweep caps work and never executes approval-gated commands", async () => {
  await withCloudRunEnv(async () => {
    const commands = Array.from({ length: 14 }, (_, i) => ({
      id: "CMD-" + i, status: "queued", instruction: "system:health-check", actionType: null, requiresApproval: false,
    }));
    commands.push({ id: "CMD-APPROVAL", status: "queued", instruction: "system:health-check", actionType: "external_send", requiresApproval: true });
    let calls = 0;
    const result = await sweepCloudRunQueueOnce({
      createStore: () => ({ load: async () => ({ controlCommands: commands }) }),
      processCommand: async () => { calls += 1; return { outcome: "completed" }; },
      limit: 99,
    });
    assert.equal(calls, 10);
    assert.equal(result.checked, 10);
    assert.equal(result.processed, 10);
  });
});
