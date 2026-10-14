import test from "node:test";
import assert from "node:assert/strict";
import { generateGroqDraft, getGroqTextClientStatus, GroqTextClientError } from "../src/groq-text-client.js";

const env = { GROQ_API_KEY: "gsk-test-secret-never-log", GROQ_MODEL: "qwen/qwen3.8-27b" };

test("Groq status is disconnected by default and never exposes secrets", () => {
  const status = getGroqTextClientStatus({ env: {} });
  assert.equal(status.status, "not_configured");
  assert.equal(status.verified, false);
  assert.equal(status.toolCallsEnabled, false);
  assert.equal(JSON.stringify(status).includes("gsk-"), false);
});

test("Groq sends a bounded text-only draft request and returns review-only output", async () => {
  let request;
  const result = await generateGroqDraft({
    purpose: "script", subject: "فيديو قصير عن مكتبة الإسكندرية", context: "الجمهور عام",
    requirements: "لغة عربية سليمة", language: "ar"
  }, {
    env,
    fetchImpl: async (url, options) => {
      request = { url: String(url), options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: "مسودة اختبارية للمراجعة." } }] }),
        { status: 200, headers: { "content-type": "application/json" } });
    }
  });
  assert.equal(request.url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.redirect, "error");
  assert.equal(request.body.model, "qwen/qwen3.8-27b");
  assert.equal(request.body.max_tokens, 1200);
  assert.equal(request.body.stream, false);
  assert.equal(request.body.tools, undefined);
  assert.match(request.body.messages[0].content, /Never publish, send, schedule/);
  assert.equal(result.status, "draft_for_review");
  assert.equal(result.text, "مسودة اختبارية للمراجعة.");
  assert.equal(JSON.stringify(result).includes(env.GROQ_API_KEY), false);
});

test("invalid purpose is rejected before any outbound request", async () => {
  let called = false;
  await assert.rejects(generateGroqDraft({ purpose: "publish", subject: "انشر الآن" }, {
    env, fetchImpl: async () => { called = true; return new Response("{}", { status: 200 }); }
  }), e => e instanceof GroqTextClientError && e.code === "invalid_draft_purpose" && e.httpStatus === 400);
  assert.equal(called, false);
});

test("429 does not trigger retries or paid fallback", async () => {
  let calls = 0;
  await assert.rejects(generateGroqDraft({ purpose: "brief", subject: "خطة إنتاج محتوى" }, {
    env, fetchImpl: async () => { calls++; return new Response("{}", { status: 429 }); }
  }), e => e instanceof GroqTextClientError && e.code === "groq_rate_limited" && e.httpStatus === 429);
  assert.equal(calls, 1);
});

test("missing key fails closed without contacting Groq", async () => {
  let called = false;
  await assert.rejects(generateGroqDraft({ purpose: "outline", subject: "مخطط مشاهد" }, {
    env: {}, fetchImpl: async () => { called = true; return new Response("{}", { status: 200 }); }
  }), e => e instanceof GroqTextClientError && e.code === "groq_not_configured" && e.httpStatus === 409);
  assert.equal(called, false);
});
