import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("Groq route requires owner auth and persists only review drafts", async () => {
  const keys = ["ZOZ_DATA_DIR", "ZOZ_CONTROL_TOKEN", "GROQ_API_KEY", "GROQ_MODEL"];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-groq-route-"));
  let apiCall = false;
  process.env.ZOZ_DATA_DIR = dir;
  process.env.ZOZ_CONTROL_TOKEN = "test-control-token";
  process.env.GROQ_API_KEY = "gsk-test-secret-never-log";
  process.env.GROQ_MODEL = "qwen/qwen3.8-27b";
  globalThis.fetch = async (input, options = {}) => {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
    if (url === "https://api.groq.com/openai/v1/chat/completions") {
      apiCall = true;
      assert.equal(options.headers.authorization, "Bearer gsk-test-secret-never-log");
      return new Response(JSON.stringify({ choices: [{ message: { content: "مسودة محفوظة للمراجعة فقط." } }] }),
        { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, options);
  };
  let server;
  try {
    const imported = await import("../src/server.js");
    server = imported.server;
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const noAuth = await originalFetch(`${base}/api/content-factory/text/draft`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ purpose: "script", subject: "اختبار كتابة" })
    });
    assert.equal(noAuth.status, 401);
    assert.equal(apiCall, false);

    const response = await originalFetch(`${base}/api/content-factory/text/draft`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test-control-token" },
      body: JSON.stringify({ purpose: "script", subject: "فيديو قصير عن تاريخ الكتابة", language: "ar" })
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.equal(result.publicationEnabled, false);
    assert.equal(result.draft.status, "draft_for_review");
    assert.equal(result.draft.publishedAt, null);
    assert.equal(result.draft.sentAt, null);
    assert.equal(result.draft.text, "مسودة محفوظة للمراجعة فقط.");
    assert.equal(apiCall, true);

    const stateResponse = await originalFetch(`${base}/api/state`, {
      headers: { authorization: "Bearer test-control-token" }
    });
    const state = await stateResponse.json();
    assert.equal(state.contentDrafts[0].id, result.draft.id);
    assert.equal(state.contentDrafts[0].text, result.draft.text);
    assert.equal(state.publications?.length ?? 0, 0);
    assert.equal(JSON.stringify(state).includes("gsk-test-secret-never-log"), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (server?.listening) await new Promise(resolve => server.close(resolve));
    await fs.rm(dir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
