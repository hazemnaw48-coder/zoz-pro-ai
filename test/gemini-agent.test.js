import test from "node:test";
import assert from "node:assert/strict";
import {
  extractGeminiPrompt,
  generateGeminiText,
  getConfiguredGeminiModel,
  GEMINI_AGENT_LIMITS,
} from "../src/gemini-agent.js";

test("Gemini task prefix accepts bounded prompts and rejects malformed prompts", () => {
  assert.equal(extractGeminiPrompt("gemini:assist: write a short Arabic video script"), "write a short Arabic video script");
  assert.equal(extractGeminiPrompt("system:health-check"), null);
  assert.equal(extractGeminiPrompt("gemini:assist:"), null);
  assert.equal(extractGeminiPrompt("gemini:assist:" + "x".repeat(3501)), null);
  assert.equal(GEMINI_AGENT_LIMITS.maxPromptChars, 3500);
});

test("Gemini model can be configured and invalid model identifiers fail closed", () => {
  assert.equal(getConfiguredGeminiModel({}), "gemini-3.8-flash");
  assert.equal(getConfiguredGeminiModel({ GEMINI_MODEL: "gemini-2.5-pro" }), "gemini-2.5-pro");
  assert.throws(() => getConfiguredGeminiModel({ GEMINI_MODEL: "https://attacker.example" }), /model name is invalid/);
});

test("Gemini text generation sends the task server-side and returns generated text only", async () => {
  let capturedUrl;
  let capturedOptions;
  const result = await generateGeminiText("اكتب مقدمة لفيديو أطفال عن القمر", {
    env: { GEMINI_API_KEY: "test-key", GEMINI_MODEL: "gemini-3.8-flash" },
    timeoutMs: 2000,
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 200,
        json: async () => ({ candidates: [{ content: { parts: [{ text: "مقدمة تجريبية آمنة." }] } }] }),
      };
    },
  });
  assert.equal(result, "مقدمة تجريبية آمنة.");
  assert.match(capturedUrl, /models\/gemini-2\.5-flash:generateContent$/);
  assert.equal(capturedOptions.headers["x-goog-api-key"], "test-key");
  assert.equal(capturedOptions.method, "POST");
  assert.match(JSON.stringify(JSON.parse(capturedOptions.body)), /اكتب مقدمة لفيديو أطفال عن القمر/);
  assert.doesNotMatch(result, /sent|published/i);
});

test("Gemini agent fails closed when the API key is absent", async () => {
  await assert.rejects(
    generateGeminiText("Write a draft", { env: {}, fetchImpl: async () => { throw new Error("must not call"); } }),
    (error) => error.code === "gemini_not_configured",
  );
});

test("Gemini agent blocks credential-like inputs before making a request", async () => {
  let called = false;
  await assert.rejects(
    generateGeminiText("Please inspect this token: ghp_abcdefghijklmnopqrstuvwxyz0123456789", {
      env: { GEMINI_API_KEY: "test-key" },
      fetchImpl: async () => { called = true; throw new Error("must not call"); },
    }),
    (error) => error.code === "sensitive_input_blocked",
  );
  assert.equal(called, false);
});

test("Gemini API errors expose safe status codes, not provider payloads or keys", async () => {
  await assert.rejects(
    generateGeminiText("Write a draft", {
      env: { GEMINI_API_KEY: "test-key" },
      fetchImpl: async () => ({ ok: false, status: 429, json: async () => ({ error: { message: "private provider details" } }) }),
    }),
    (error) => error.code === "gemini_rate_limited" && !error.message.includes("private provider details"),
  );
});
