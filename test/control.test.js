import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("mobile control queue persists normal commands and blocks risky commands pending approval", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-control-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";
  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const assignment = await fetch(`http://127.0.0.1:${port}/api/tasks/ZP-006/assign`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-control-token" },
      body: JSON.stringify({ agent: "codex", actor: "CEO/Manager" }),
    });
    assert.equal(assignment.status, 200);

    const normal = await fetch(`http://127.0.0.1:${port}/api/control/commands`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-control-token" },
      body: JSON.stringify({ instruction: "Review ZP-001 and report findings." }),
    });
    assert.equal(normal.status, 201);
    const normalCommand = await normal.json();
    assert.equal(normalCommand.status, "queued");

    const risky = await fetch(`http://127.0.0.1:${port}/api/control/commands`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-control-token" },
      body: JSON.stringify({
        instruction: "Deploy the application.",
        actionType: "production_affecting",
      }),
    });
    assert.equal(risky.status, 201);
    const riskyCommand = await risky.json();
    assert.equal(riskyCommand.status, "awaiting_approval");

    const state = await (await fetch(`http://127.0.0.1:${port}/api/state`, { headers: { authorization: "Bearer test-control-token" } })).json();
    assert.equal(state.controlCommands.length, 2);
    assert.equal(state.controlCommands[0].instruction, "Deploy the application.");
    assert.equal(state.approvals[0].commandId, riskyCommand.id);
    const approve = await fetch(`http://127.0.0.1:${port}/api/approvals/${encodeURIComponent(riskyCommand.approvalId)}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-control-token" },
      body: JSON.stringify({ decidedBy: "Owner" }),
    });
    assert.equal(approve.status, 200);
    const afterApproval = await (await fetch(`http://127.0.0.1:${port}/api/state`, { headers: { authorization: "Bearer test-control-token" } })).json();
    assert.equal(afterApproval.controlCommands[0].status, "queued");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    delete process.env.ZOZ_CONTROL_TOKEN;
    await fs.rm(dir, { recursive: true, force: true });
  }
});


test("commands bind to a real Codex task and rejected approvals cancel execution", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-zp006-control-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";
  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const headers = { "content-type": "application/json", authorization: "Bearer test-control-token" };

  try {
    const taskResponse = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: "POST", headers,
      body: JSON.stringify({ id: "ZP-006-T1", title: "Workflow test", assignedAgent: "codex" }),
    });
    assert.equal(taskResponse.status, 201);

    const assignment = await fetch(`http://127.0.0.1:${port}/api/tasks/ZP-006-T1/assign`, {
      method: "POST", headers,
      body: JSON.stringify({ agent: "codex", actor: "CEO/Manager" }),
    });
    assert.equal(assignment.status, 200);
    assert.equal((await assignment.json()).status, "assigned");

    const commandResponse = await fetch(`http://127.0.0.1:${port}/api/control/commands`, {
      method: "POST", headers,
      body: JSON.stringify({ taskId: "ZP-006-T1", instruction: "Run safe tests." }),
    });
    assert.equal(commandResponse.status, 201);
    const command = await commandResponse.json();
    assert.equal(command.taskId, "ZP-006-T1");
    assert.equal(command.status, "queued");

    const claim = await fetch(`http://127.0.0.1:${port}/api/control/commands/${command.id}/claim`, {
      method: "POST", headers, body: JSON.stringify({ actor: "Codex Executor" }),
    });
    assert.equal(claim.status, 200);
    const postClaimState = await (await fetch(`http://127.0.0.1:${port}/api/state`, { headers })).json();
    assert.equal(postClaimState.tasks.find((item) => item.id === "ZP-006-T1").status, "executing");

    const riskyTaskResponse = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: "POST", headers,
      body: JSON.stringify({ id: "ZP-006-T2", title: "Risk gate test", assignedAgent: "codex" }),
    });
    assert.equal(riskyTaskResponse.status, 201);
    const riskyAssignment = await fetch(`http://127.0.0.1:${port}/api/tasks/ZP-006-T2/assign`, {
      method: "POST", headers,
      body: JSON.stringify({ agent: "codex", actor: "CEO/Manager" }),
    });
    assert.equal(riskyAssignment.status, 200);

    const risky = await fetch(`http://127.0.0.1:${port}/api/control/commands`, {
      method: "POST", headers,
      body: JSON.stringify({ taskId: "ZP-006-T2", instruction: "Delete production data.", actionType: "destructive" }),
    });
    assert.equal(risky.status, 201);
    const riskyCommand = await risky.json();
    assert.equal(riskyCommand.status, "awaiting_approval");

    const reject = await fetch(`http://127.0.0.1:${port}/api/approvals/${encodeURIComponent(riskyCommand.approvalId)}/reject`, {
      method: "POST", headers, body: JSON.stringify({ decidedBy: "Owner" }),
    });
    assert.equal(reject.status, 200);

    const state = await (await fetch(`http://127.0.0.1:${port}/api/state`, { headers })).json();
    const cancelled = state.controlCommands.find((item) => item.id === riskyCommand.id);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.error, "Owner rejected approval.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    delete process.env.ZOZ_CONTROL_TOKEN;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
