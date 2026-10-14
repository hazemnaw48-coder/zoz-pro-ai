import test from "node:test";
import assert from "node:assert/strict";
import {
  GpuWorkerClientError,
  getGpuWorkerStatus,
  verifyGpuWorkerHandshake,
} from "../src/gpu-worker-client.js";

const goodEnv = () => ({
  ZOZ_GPU_WORKER_URL: "https://gpu-worker.example.test",
  ZOZ_GPU_WORKER_TOKEN: "g".repeat(40),
});

const validResponse = (overrides = {}) => new Response(JSON.stringify({
  success: true,
  integration: "zoz-pro-gpu-worker",
  authenticated: true,
  capabilities: ["video_generation", "video_render", "asset_transfer"],
  ...overrides,
}), { status: 200, headers: { "content-type": "application/json" } });

test("GPU worker defaults disconnected without renting or spending", () => {
  const status = getGpuWorkerStatus({ env: {} });
  assert.equal(status.status, "not_connected");
  assert.equal(status.verified, false);
  assert.equal(status.providerType, "hourly_rented_gpu_worker");
  assert.equal(status.costGuard.startsRentalAutomatically, false);
  assert.equal(status.costGuard.launchesGenerationAutomatically, false);
  assert.equal(status.costGuard.ownerApprovalRequiredForPaidUsage, true);
  assert.equal(JSON.stringify(status).includes("g".repeat(40)), false);
});

test("configured GPU worker is not considered live until handshake passes", () => {
  const status = getGpuWorkerStatus({ env: goodEnv() });
  assert.equal(status.status, "configured_unverified");
  assert.equal(status.verified, false);
  assert.equal(JSON.stringify(status).includes("g".repeat(40)), false);
});

test("rejects non-HTTPS, path-bearing, and credential-bearing worker origins", () => {
  for (const url of [
    "http://gpu-worker.example.test",
    "https://gpu-worker.example.test/api",
    "https://user:pass@gpu-worker.example.test",
  ]) {
    assert.equal(getGpuWorkerStatus({ env: { ...goodEnv(), ZOZ_GPU_WORKER_URL: url } }).status, "invalid_configuration");
  }
});

test("rejects a short token before making any request", async () => {
  let called = false;
  await assert.rejects(
    verifyGpuWorkerHandshake({
      env: { ...goodEnv(), ZOZ_GPU_WORKER_TOKEN: "short" },
      fetchImpl: async () => { called = true; return validResponse(); },
    }),
    (error) => error.code === "worker_not_configured",
  );
  assert.equal(called, false);
});

test("successful handshake uses only the protected read-only endpoint", async () => {
  let request;
  const result = await verifyGpuWorkerHandshake({
    env: goodEnv(),
    fetchImpl: async (url, options) => {
      request = { url, options };
      return validResponse();
    },
  });
  assert.equal(request.url, "https://gpu-worker.example.test/api/zozpro/health");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.headers.authorization, `Bearer ${"g".repeat(40)}`);
  assert.equal(request.options.redirect, "error");
  assert.equal(result.status, "connected");
  assert.equal(result.verified, true);
  assert.equal(result.costGuard.rentalStarted, false);
  assert.equal(result.costGuard.generationStarted, false);
  assert.equal(JSON.stringify(result).includes("g".repeat(40)), false);
});

test("never falls back to an unprotected GPU or legacy endpoint", async () => {
  const calls = [];
  await assert.rejects(
    verifyGpuWorkerHandshake({
      env: goodEnv(),
      fetchImpl: async (url) => { calls.push(url); return new Response("not found", { status: 404 }); },
    }),
    (error) => error.code === "worker_secure_endpoint_missing",
  );
  assert.deepEqual(calls, ["https://gpu-worker.example.test/api/zozpro/health"]);
});

test("rejects wrong auth and unknown worker capabilities", async () => {
  await assert.rejects(
    verifyGpuWorkerHandshake({ env: goodEnv(), fetchImpl: async () => new Response("forbidden", { status: 403 }) }),
    (error) => error.code === "worker_auth_rejected",
  );
  await assert.rejects(
    verifyGpuWorkerHandshake({
      env: goodEnv(),
      fetchImpl: async () => validResponse({ capabilities: ["video_generation", "start_rental_now"] }),
    }),
    (error) => error.code === "worker_unexpected_response",
  );
});

test("network errors do not reveal endpoint internals", async () => {
  await assert.rejects(
    verifyGpuWorkerHandshake({
      env: goodEnv(),
      fetchImpl: async () => { throw new Error("private token and host details"); },
    }),
    (error) => error.code === "worker_unreachable" && !error.message.includes("private token"),
  );
});
