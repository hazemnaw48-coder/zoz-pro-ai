import test from "node:test";
import assert from "node:assert/strict";
import {
  ContentStudioClientError,
  getContentStudioClientStatus,
  verifyContentStudioHandshake,
} from "../src/content-studio-client.js";

const goodEnv = () => ({
  ZOZ_CONTENT_STUDIO_URL: "https://studio.example.test",
  ZOZ_CONTENT_STUDIO_TOKEN: "z".repeat(40),
});

const validResponse = (overrides = {}) => new Response(JSON.stringify({
  success: true,
  studio: "ZOZ Content Production Studio",
  integration: "zoz-pro",
  authenticated: true,
  capabilities: ["script", "tts", "render", "asset_upload"],
  ...overrides,
}), { status: 200, headers: { "content-type": "application/json" } });

test("status is disconnected by default and never returns secrets", () => {
  const status = getContentStudioClientStatus({ env: {} });
  assert.equal(status.status, "not_connected");
  assert.equal(status.verified, false);
  assert.ok(status.missingConfiguration.includes("ZOZ_CONTENT_STUDIO_URL"));
  assert.equal(JSON.stringify(status).includes("z".repeat(40)), false);
});

test("status never treats configured credentials as a verified connection", () => {
  const status = getContentStudioClientStatus({ env: goodEnv() });
  assert.equal(status.status, "configured_unverified");
  assert.equal(status.verified, false);
  assert.equal(status.expectedHandshakePath, "/api/zozpro/health");
  assert.equal(JSON.stringify(status).includes("z".repeat(40)), false);
});

test("rejects non-HTTPS and path-bearing origins", async () => {
  const env = goodEnv();
  env.ZOZ_CONTENT_STUDIO_URL = "http://studio.example.test";
  assert.equal(getContentStudioClientStatus({ env }).status, "invalid_configuration");
  env.ZOZ_CONTENT_STUDIO_URL = "https://studio.example.test/api";
  assert.equal(getContentStudioClientStatus({ env }).status, "invalid_configuration");
});

test("rejects short dedicated tokens before making a request", async () => {
  const env = goodEnv();
  env.ZOZ_CONTENT_STUDIO_TOKEN = "short";
  let called = false;
  await assert.rejects(
    verifyContentStudioHandshake({ env, fetchImpl: async () => { called = true; return validResponse(); } }),
    (error) => error.code === "studio_not_configured",
  );
  assert.equal(called, false);
});

test("handshake targets only the new secure endpoint and sends a dedicated bearer token", async () => {
  const env = goodEnv();
  let request;
  const result = await verifyContentStudioHandshake({
    env,
    fetchImpl: async (url, options) => {
      request = { url, options };
      return validResponse();
    },
  });
  assert.equal(request.url, "https://studio.example.test/api/zozpro/health");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.headers.authorization, `Bearer ${"z".repeat(40)}`);
  assert.equal(request.options.redirect, "error");
  assert.equal(result.status, "connected");
  assert.equal(result.verified, true);
  assert.deepEqual(result.capabilities, ["script", "tts", "render", "asset_upload"]);
  assert.equal(JSON.stringify(result).includes("z".repeat(40)), false);
});

test("does not fall back to legacy unprotected endpoints when the secure endpoint is absent", async () => {
  const calls = [];
  await assert.rejects(
    verifyContentStudioHandshake({
      env: goodEnv(),
      fetchImpl: async (url) => {
        calls.push(url);
        return new Response("not found", { status: 404 });
      },
    }),
    (error) => error.code === "studio_secure_endpoint_missing",
  );
  assert.deepEqual(calls, ["https://studio.example.test/api/zozpro/health"]);
});

test("rejects invalid tokens and unexpected handshake payloads", async () => {
  await assert.rejects(
    verifyContentStudioHandshake({
      env: goodEnv(),
      fetchImpl: async () => new Response("forbidden", { status: 403 }),
    }),
    (error) => error.code === "studio_auth_rejected",
  );
  await assert.rejects(
    verifyContentStudioHandshake({
      env: goodEnv(),
      fetchImpl: async () => validResponse({ authenticated: false }),
    }),
    (error) => error.code === "studio_unexpected_response",
  );
});

test("does not follow redirects or expose upstream error content", async () => {
  await assert.rejects(
    verifyContentStudioHandshake({
      env: goodEnv(),
      fetchImpl: async () => { throw new Error("sensitive internal URL"); },
    }),
    (error) => error.code === "studio_unreachable" && !error.message.includes("sensitive"),
  );
});
