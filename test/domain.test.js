import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransitionTask,
  createInitialState,
  requiresApproval,
  validateState,
} from "../src/domain.js";

test("risk actions always require explicit approval", () => {
  assert.equal(requiresApproval("financial"), true);
  assert.equal(requiresApproval("external_send"), true);
  assert.equal(requiresApproval("production_affecting"), true);
  assert.equal(requiresApproval("ordinary_read"), false);
});

test("task lifecycle allows execution only through verification", () => {
  assert.equal(canTransitionTask("planned", "assigned"), true);
  assert.equal(canTransitionTask("assigned", "executing"), true);
  assert.equal(canTransitionTask("executing", "verification"), true);
  assert.equal(canTransitionTask("verification", "completed"), true);
  assert.equal(canTransitionTask("planned", "completed"), false);
  assert.equal(canTransitionTask("executing", "completed"), false);
});

test("initial state is bounded to the ZOZ Pro repository and main integration branch", () => {
  const state = createInitialState();
  assert.equal(state.project.repository, "hazemnaw48-coder/zoz-pro-ai");
  assert.equal(state.project.integrationBranch, "main");
  assert.equal(state.project.currentBranch, "task/ZP-001-foundation");
  assert.equal(validateState(state), true);
});

test("approval risk catalog is persisted in settings", () => {
  const state = createInitialState();
  assert.deepEqual(state.settings.approvalRequiredForRiskTypes, [
    "financial",
    "destructive",
    "external_send",
    "irreversible",
    "production_affecting",
    "credential_affecting",
    "account_affecting",
  ]);
});
