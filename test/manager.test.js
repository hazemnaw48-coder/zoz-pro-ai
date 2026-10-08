import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/domain.js";
import { summarizeSystem } from "../src/manager.js";

test("technical manager reports a ready local-first system", () => {
  const state = createInitialState();
  const summary = summarizeSystem(state);

  assert.equal(summary.manager, "ZOZ Pro Technical Manager");
  assert.equal(summary.status, "ready");
  assert.equal(summary.mode, "local-first");
  assert.equal(summary.executor.status, "offline");
  assert.equal(summary.deployment, "not_deployed");
  assert.equal(summary.counts.tasks, 1);
  assert.equal(summary.counts.activeTasks, 1);
  assert.equal(summary.policy.autoDeploy, false);
  assert.equal(summary.policy.concurrentCodingAgents, 1);
  assert.equal(summary.policy.managerMayAutoExecuteRiskyActions, false);
  assert.equal(summary.workAreas.length, 8);
});

test("technical manager escalates failures, approvals, and offline queued commands", () => {
  const state = createInitialState();
  state.tasks[0].status = "failed";
  state.approvals.push({
    id: "APR-test",
    taskId: "ZP-001",
    actionType: "financial",
    status: "pending",
  });
  state.controlCommands = [{
    id: "CMD-test",
    status: "queued",
    requiresApproval: false,
    instruction: "Run tests",
  }];

  const summary = summarizeSystem(state);

  assert.equal(summary.status, "attention");
  assert.equal(summary.counts.failedTasks, 1);
  assert.equal(summary.counts.pendingApprovals, 1);
  assert.equal(summary.counts.queuedCommands, 1);
  assert.ok(summary.alerts.some((alert) => alert.includes("failed task")));
  assert.ok(summary.alerts.some((alert) => alert.includes("approval request")));
  assert.ok(summary.alerts.some((alert) => alert.includes("queued while the Codex executor is offline")));
  assert.match(summary.nextAction, /failed task/);
});
