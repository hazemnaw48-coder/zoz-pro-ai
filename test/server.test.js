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

    const unauthorizedFactoryStatus = await fetch(`http://127.0.0.1:${port}/api/content-factory/status`);
    assert.equal(unauthorizedFactoryStatus.status, 401);

    const factoryStatusResponse = await fetch(`http://127.0.0.1:${port}/api/content-factory/status`, {
      headers: { authorization: "Bearer test-control-token" },
    });
    assert.equal(factoryStatusResponse.status, 200);
    const factoryStatus = await factoryStatusResponse.json();
    assert.equal(factoryStatus.projectBoundary.legacyZoZAiMayBeModified, false);
    assert.equal(factoryStatus.safety.publishingEnabled, false);
    assert.equal(factoryStatus.safety.outboundConnectionChecksPerformed, false);
    assert.ok(factoryStatus.connectors.some((item) => item.id === "zoz-content-studio" && item.status === "not_connected"));

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


test("server creates and persists scored opportunities and intelligence", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-opportunities-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";
  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const headers = { "content-type": "application/json", authorization: "Bearer test-control-token" };
  try {
    const opportunityResponse = await fetch(`http://127.0.0.1:${port}/api/opportunities`, {
      method: "POST", headers,
      body: JSON.stringify({ title:"Test opportunity", source:"test", fit:25, value:20, urgency:15, confidence:10 }),
    });
    assert.equal(opportunityResponse.status, 201);
    const opportunity = await opportunityResponse.json();
    assert.equal(opportunity.score, 70);

    const intelligenceResponse = await fetch(`http://127.0.0.1:${port}/api/intelligence`, {
      method: "POST", headers,
      body: JSON.stringify({ type:"market", signal:"Test signal", confidence:80, relevance:60 }),
    });
    assert.equal(intelligenceResponse.status, 201);
    assert.equal((await intelligenceResponse.json()).score, 70);

    const persisted = await createStateStore(path.join(dir, "zoz-pro-state.json")).load();
    assert.equal(persisted.opportunities[0].score, 70);
    assert.equal(persisted.intelligence[0].score, 70);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    delete process.env.ZOZ_CONTROL_TOKEN;
    await fs.rm(dir, { recursive: true, force: true });
  }
});


test("server creates and persists CRM contacts", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-crm-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";
  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const headers = { "content-type": "application/json", authorization: "Bearer test-control-token" };
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/contacts`, {
      method:"POST", headers,
      body:JSON.stringify({ name:"CRM Test", company:"Acme", status:"qualified", nextAction:"Follow up" }),
    });
    assert.equal(response.status, 201);
    const contact = await response.json();
    assert.equal(contact.status, "qualified");

    const persisted = await createStateStore(path.join(dir, "zoz-pro-state.json")).load();
    assert.equal(persisted.contacts[0].name, "CRM Test");
    assert.equal(persisted.contacts[0].status, "qualified");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    delete process.env.ZOZ_CONTROL_TOKEN;
    await fs.rm(dir, { recursive:true, force:true });
  }
});


test("server creates and persists outreach only for existing contacts", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-outreach-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";
  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const headers = { "content-type":"application/json", authorization:"Bearer test-control-token" };
  try {
    const contactResponse = await fetch(`http://127.0.0.1:${port}/api/contacts`, {
      method:"POST", headers, body:JSON.stringify({ name:"Outreach Test" }),
    });
    assert.equal(contactResponse.status, 201);
    const contact = await contactResponse.json();

    const response = await fetch(`http://127.0.0.1:${port}/api/outreach`, {
      method:"POST", headers,
      body:JSON.stringify({ contactId:contact.id, channel:"whatsapp", message:"Test follow-up", followUpNumber:1 }),
    });
    assert.equal(response.status, 201);
    const item = await response.json();
    assert.equal(item.status, "draft");

    const sent = await fetch(`http://127.0.0.1:${port}/api/outreach/${encodeURIComponent(item.id)}/status`, {
      method:"POST", headers, body:JSON.stringify({ status:"sent" }),
    });
    assert.equal(sent.status, 200);
    assert.equal((await sent.json()).status, "sent");

    const persisted = await createStateStore(path.join(dir, "zoz-pro-state.json")).load();
    assert.equal(persisted.outreach[0].contactId, contact.id);
    assert.equal(persisted.outreach[0].status, "sent");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    delete process.env.ZOZ_CONTROL_TOKEN;
    await fs.rm(dir, { recursive:true, force:true });
  }
});


test("ZP-006 verification requires every declared check and completes only from verification", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-zp006-verify-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";
  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const headers = { "content-type": "application/json", authorization: "Bearer test-control-token" };

  try {
    const create = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: "POST", headers,
      body: JSON.stringify({
        id: "ZP-006-V1",
        title: "Verification test",
        requiredChecks: ["build", "tests", "audit"],
      }),
    });
    assert.equal(create.status, 201);

    const assigned = await fetch(`http://127.0.0.1:${port}/api/tasks/ZP-006-V1/transition`, {
      method: "POST", headers, body: JSON.stringify({ status: "assigned", actor: "CEO/Manager" }),
    });
    assert.equal(assigned.status, 200);

    const executing = await fetch(`http://127.0.0.1:${port}/api/tasks/ZP-006-V1/transition`, {
      method: "POST", headers, body: JSON.stringify({ status: "executing", actor: "Codex" }),
    });
    assert.equal(executing.status, 200);

    const verification = await fetch(`http://127.0.0.1:${port}/api/tasks/ZP-006-V1/transition`, {
      method: "POST", headers, body: JSON.stringify({ status: "verification", actor: "Codex" }),
    });
    assert.equal(verification.status, 200);

    const incomplete = await fetch(`http://127.0.0.1:${port}/api/tasks/ZP-006-V1/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        passed: true,
        checks: { build: true, tests: true, audit: false },
        evidence: "audit check failed",
        commitSha: "abc123",
      }),
    });
    assert.equal(incomplete.status, 409);
    assert.equal((await incomplete.json()).error, "verification_failed");

    const stateAfterFailure = await (await fetch(`http://127.0.0.1:${port}/api/state`, { headers })).json();
    assert.equal(stateAfterFailure.tasks.find((item) => item.id === "ZP-006-V1").status, "failed");

    const create2 = await fetch(`http://127.0.0.1:${port}/api/tasks`, {
      method: "POST", headers,
      body: JSON.stringify({ id: "ZP-006-V2", title: "Successful verification", requiredChecks: ["build", "tests"] }),
    });
    assert.equal(create2.status, 201);
    for (const status of ["assigned", "executing", "verification"]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/tasks/ZP-006-V2/transition`, {
        method: "POST", headers, body: JSON.stringify({ status, actor: "Codex" }),
      });
      assert.equal(response.status, 200);
    }

    const complete = await fetch(`http://127.0.0.1:${port}/api/tasks/ZP-006-V2/verify`, {
      method: "POST", headers,
      body: JSON.stringify({
        passed: true,
        checks: { build: true, tests: true },
        evidence: "All required checks passed.",
        commitSha: "def456",
      }),
    });
    assert.equal(complete.status, 200);
    const result = await complete.json();
    assert.equal(result.task.status, "completed");
    assert.equal(result.verification.commitSha, "def456");

    const state = await (await fetch(`http://127.0.0.1:${port}/api/state`, { headers })).json();
    assert.equal(state.project.lastVerifiedCommit, "def456");
    assert.equal(state.activity[0].type, "task_verified");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    delete process.env.ZOZ_CONTROL_TOKEN;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
