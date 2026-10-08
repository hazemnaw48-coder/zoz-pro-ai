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
  assert.equal(state.project.currentTask, "ZP-006");
  assert.equal(state.project.currentBranch, "task/zp-006-ceo-task-command-audit");
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

import { assertControlCommandTransition, normalizeControlCommandInput } from "../src/control.js";

test("mobile control commands are normalized and risk-gated", () => {
  assert.deepEqual(normalizeControlCommandInput({
    instruction: "Run the ZP-001 verification",
  }), {
    instruction: "Run the ZP-001 verification",
    actionType: null,
    requiresApproval: false,
  });
  assert.equal(normalizeControlCommandInput({
    instruction: "Deploy",
    actionType: "production_affecting",
  }).requiresApproval, true);
});

test("control command lifecycle cannot skip Codex claim", () => {
  assert.equal(assertControlCommandTransition("queued", "claimed"), undefined);
  assert.throws(() => assertControlCommandTransition("queued", "completed"), /Invalid control command transition/);
});
