import test from "node:test";
import assert from "node:assert/strict";
import { assignTask, createExecutionDecision, evaluateExecutionGate } from "../src/orchestrator.js";

function task(overrides = {}) {
  return {
    id: "ZP-007-T1",
    title: "Orchestrator test",
    status: "planned",
    assignedAgent: null,
    ...overrides,
  };
}

test("assigns a planned task to Codex and moves it to assigned", () => {
  const result = assignTask(task(), { agent: "codex", actor: "CEO/Manager" });
  assert.equal(result.status, "assigned");
  assert.equal(result.assignedAgent, "codex");
  assert.equal(result.assignedBy, "CEO/Manager");
});

test("safe assigned work is executable autonomously", () => {
  const result = evaluateExecutionGate({
    task: task({ status: "assigned", assignedAgent: "codex" }),
  });
  assert.equal(result.allowed, true);
  assert.equal(result.safeAutonomy, true);
  assert.equal(result.nextStatus, "executing");
});

test("protected execution stops until owner approval", () => {
  const blocked = createExecutionDecision({
    task: task({ status: "assigned", assignedAgent: "codex" }),
    actionType: "external_send",
    approvalStatus: "pending",
  });
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "approval_required");

  const approved = createExecutionDecision({
    task: task({ status: "assigned", assignedAgent: "codex" }),
    actionType: "external_send",
    approvalStatus: "approved",
  });
  assert.equal(approved.allowed, true);
  assert.equal(approved.safeAutonomy, false);
});

test("execution gate rejects blocked tasks and non-Codex execution", () => {
  assert.equal(
    evaluateExecutionGate({
      task: task({ status: "blocked", assignedAgent: "codex" }),
    }).allowed,
    false,
  );

  assert.equal(
    evaluateExecutionGate({
      task: task({ status: "assigned", assignedAgent: "paperclip" }),
    }).reason,
    "unsupported_execution_agent",
  );
});
