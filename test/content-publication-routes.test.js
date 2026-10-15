import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createStateStore } from "../src/store.js";

test("publisher status is authenticated and does not expose secrets", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-publisher-status-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";
  process.env.UPLOAD_POST_API_KEY = "private-test-key";
  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const unauthorized = await fetch("http://127.0.0.1:" + port + "/api/content-factory/publisher/status");
    assert.equal(unauthorized.status, 401);
    const response = await fetch("http://127.0.0.1:" + port + "/api/content-factory/publisher/status", {
      headers: { authorization: "Bearer test-control-token" },
    });
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.provider, "Upload-Post");
    assert.equal(status.status, "not_configured");
    assert.equal(JSON.stringify(status).includes("private-test-key"), false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    delete process.env.ZOZ_CONTROL_TOKEN;
    delete process.env.UPLOAD_POST_API_KEY;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("publication draft requires owner approval and does not send when provider is unconfigured", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-publication-"));
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";
  process.env.ZOZ_PRO_MEDIA_CENTER_URL = "https://media-center.example.com";
  delete process.env.ZOZ_PRO_MEDIA_CENTER_SELECTED;
  delete process.env.UPLOAD_POST_API_KEY;
  delete process.env.UPLOAD_POST_PROFILE;
  delete process.env.ZOZ_PRO_PUBLISHING_ENABLED;
  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const headers = { "content-type": "application/json", authorization: "Bearer test-control-token" };
  try {
    const blockedDraft = await fetch("http://127.0.0.1:" + port + "/api/content-factory/publications", {
      method: "POST",
      headers,
      body: JSON.stringify({
        taskId: "ZP-001",
        jobId: "render_1791632034935_ekl8",
        title: "كيف شُيّدت الأهرامات المصرية؟",
        description: "وثائقي قصير عن بناء الأهرامات.",
        hashtags: ["الأهرامات", "مصر_القديمة"],
      }),
    });
    assert.equal(blockedDraft.status, 409);
    assert.equal((await blockedDraft.json()).error, "media_center_not_selected");
    process.env.ZOZ_PRO_MEDIA_CENTER_SELECTED = "true";
    const draftResponse = await fetch("http://127.0.0.1:" + port + "/api/content-factory/publications", {
      method: "POST", headers, body: JSON.stringify({ taskId: "ZP-001", jobId: "render_1791632034935_ekl8", title: "كيف شُيّدت الأهرامات المصرية؟", description: "وثائقي قصير عن بناء الأهرامات.", hashtags: ["الأهرامات", "مصر_القديمة"] }),
    });
    assert.equal(draftResponse.status, 201);
    const result = await draftResponse.json();
    const publication = result.publication;
    const approval = result.approval;
    assert.equal(publication.status, "awaiting_approval");
    assert.equal(approval.actionType, "external_send");
    assert.equal(approval.status, "pending");

    const blockedSubmit = await fetch("http://127.0.0.1:" + port + "/api/content-factory/publications/" + encodeURIComponent(publication.id) + "/submit", {
      method: "POST", headers, body: "{}",
    });
    assert.equal(blockedSubmit.status, 409);
    assert.equal((await blockedSubmit.json()).error, "owner_approval_required");

    const approveResponse = await fetch("http://127.0.0.1:" + port + "/api/approvals/" + encodeURIComponent(approval.id) + "/approve", {
      method: "POST", headers, body: JSON.stringify({ decidedBy: "Owner" }),
    });
    assert.equal(approveResponse.status, 200);
    assert.equal((await approveResponse.json()).status, "approved");

    const stored = await createStateStore(path.join(dir, "zoz-pro-state.json")).load();
    assert.equal(stored.publications[0].status, "approved");
    assert.equal(stored.approvals[0].status, "approved");

    const submitWithoutProvider = await fetch("http://127.0.0.1:" + port + "/api/content-factory/publications/" + encodeURIComponent(publication.id) + "/submit", {
      method: "POST", headers, body: "{}",
    });
    assert.equal(submitWithoutProvider.status, 409);
    assert.equal((await submitWithoutProvider.json()).error, "publisher_not_configured");

    const afterSubmit = await createStateStore(path.join(dir, "zoz-pro-state.json")).load();
    assert.equal(afterSubmit.publications[0].status, "approved");
    assert.ok(afterSubmit.activity.some((item) => item.type === "content_publication_approval_approved"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    delete process.env.ZOZ_CONTROL_TOKEN;
    delete process.env.ZOZ_PRO_MEDIA_CENTER_URL;
    delete process.env.ZOZ_PRO_MEDIA_CENTER_SELECTED;
    delete process.env.UPLOAD_POST_API_KEY;
    delete process.env.UPLOAD_POST_PROFILE;
    delete process.env.ZOZ_PRO_PUBLISHING_ENABLED;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
