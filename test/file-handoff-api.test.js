import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("handoff API requires owner token and persists files with authenticated download", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-handoff-api-"));
  const oldDir = process.env.ZOZ_DATA_DIR;
  const oldToken = process.env.ZOZ_CONTROL_TOKEN;
  const oldCloud = process.env.ZOZ_CLOUD_STATE;
  const oldVercel = process.env.VERCEL;
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-handoff-owner-token";
  delete process.env.ZOZ_CLOUD_STATE;
  delete process.env.VERCEL;

  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const auth = { authorization: "Bearer test-handoff-owner-token" };

  try {
    const denied = await fetch(`${origin}/api/handoff`);
    assert.equal(denied.status, 401);

    const payload = Buffer.from("Gemini → ZOZ Pro", "utf8");
    const uploaded = await fetch(`${origin}/api/handoff`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        direction: "from-gemini",
        filename: "gemini-result.txt",
        contentBase64: payload.toString("base64"),
        contentType: "text/plain"
      })
    });
    assert.equal(uploaded.status, 201);
    const saved = (await uploaded.json()).file;
    assert.equal(saved.direction, "from-gemini");
    assert.equal(saved.sha256.length, 64);

    const listed = await fetch(`${origin}/api/handoff?direction=from-gemini`, { headers: auth });
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).files.length, 1);

    const download = await fetch(`${origin}/api/handoff/file?pathname=${encodeURIComponent(saved.pathname)}`, { headers: auth });
    assert.equal(download.status, 200);
    assert.equal(download.headers.get("content-disposition").includes("gemini-result.txt"), true);
    assert.equal(Buffer.from(await download.arrayBuffer()).toString("utf8"), payload.toString("utf8"));

    const importWrongDirection = await fetch(`${origin}/api/handoff/import`, {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ direction: "to-gemini", sourceUrl: "https://studio.example.com/outputs/job/video.mp4", filename: "video.mp4" })
    });
    assert.equal(importWrongDirection.status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (oldDir === undefined) delete process.env.ZOZ_DATA_DIR; else process.env.ZOZ_DATA_DIR = oldDir;
    if (oldToken === undefined) delete process.env.ZOZ_CONTROL_TOKEN; else process.env.ZOZ_CONTROL_TOKEN = oldToken;
    if (oldCloud === undefined) delete process.env.ZOZ_CLOUD_STATE; else process.env.ZOZ_CLOUD_STATE = oldCloud;
    if (oldVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = oldVercel;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
