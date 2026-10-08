import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createStateStore } from "../src/store.js";

test("server exposes state and enforces approval gate", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-server-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";

  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const stateResponse = await fetch(`http://127.0.0.1:${port}/api/state`, { headers: { authorization: "Bearer test-control-token" } });
    assert.equal(stateResponse.status, 200);
    const state = await stateResponse.json();
    assert.equal(state.project.repository, "hazemnaw48-coder/zoz-pro-ai");
    assert.ok(Array.isArray(state.workAreas));
    assert.equal(state.workAreas.some((area) => area.id === "product"), true);

    const createTask = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-control-token" },
      body: JSON.stringify({ title: "Work area routing test", workAreaId: "sales" }),
    });
    assert.equal(createTask.status, 201);
    assert.equal((await createTask.json()).workAreaId, "sales");

    const badArea = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-control-token" },
      body: JSON.stringify({ title: "Invalid area test", workAreaId: "not-real" }),
    });
    assert.equal(badArea.status, 400);

    const transition = await fetch(`http://127.0.0.1:${port}/api/tasks/ZP-001/transition`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-control-token" },
      body: JSON.stringify({ status: "verification", actionType: "external_send" }),
    });
    assert.equal(transition.status, 409);
    assert.equal((await transition.json()).error, "approval_required");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    delete process.env.ZOZ_CONTROL_TOKEN;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("server persists explicit approval decisions", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-server-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";

  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const create = await fetch(`http://127.0.0.1:${port}/api/approvals`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-control-token" },
      body: JSON.stringify({
        taskId: "ZP-001",
        actionType: "financial",
        requestedBy: "CEO/Manager",
      }),
    });
    assert.equal(create.status, 201);
    const approval = await create.json();

    const approve = await fetch(
      `http://127.0.0.1:${port}/api/approvals/${encodeURIComponent(approval.id)}/approve`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: "Bearer test-control-token" },
        body: JSON.stringify({ decidedBy: "Owner" }),
      },
    );
    assert.equal(approve.status, 200);
    assert.equal((await approve.json()).status, "approved");

    const persisted = await createStateStore(path.join(dir, "zoz-pro-state.json")).load();
    assert.equal(persisted.approvals[0].status, "approved");
    assert.equal(persisted.activity[0].type, "approval_approved");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    delete process.env.ZOZ_CONTROL_TOKEN;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
