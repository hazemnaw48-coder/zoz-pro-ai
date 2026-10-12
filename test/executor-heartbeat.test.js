import test from "node:test";
import assert from "node:assert/strict";
import { getExecutorStatus } from "../src/executor-heartbeat.js";

test("fresh executor heartbeat remains online", () => {
  const now = Date.parse("2026-10-13T00:00:30.000Z");
  const status = getExecutorStatus(
    { status: "online", lastSeen: "2026-10-13T00:00:10.000Z", hostname: "test-pc" },
    { now, timeoutMs: 30_000 },
  );

  assert.equal(status.status, "online");
  assert.equal(status.heartbeatFresh, true);
  assert.equal(status.heartbeatAgeMs, 20_000);
});

test("stale executor heartbeat becomes offline after the timeout", () => {
  const now = Date.parse("2026-10-13T00:01:00.001Z");
  const status = getExecutorStatus(
    { status: "online", lastSeen: "2026-10-13T00:00:30.000Z", hostname: "test-pc" },
    { now, timeoutMs: 30_000 },
  );

  assert.equal(status.status, "offline");
  assert.equal(status.heartbeatFresh, false);
  assert.equal(status.heartbeatAgeMs, 30_001);
});

test("missing and future heartbeats are not treated as online", () => {
  const now = Date.parse("2026-10-13T00:00:30.000Z");

  assert.equal(getExecutorStatus(null, { now }).status, "offline");
  assert.equal(
    getExecutorStatus({ lastSeen: "2026-10-13T00:01:00.000Z" }, { now }).status,
    "offline",
  );
});

test("invalid timeout falls back to 30 seconds", () => {
  const status = getExecutorStatus(
    { lastSeen: "2026-10-13T00:00:00.000Z" },
    { now: Date.parse("2026-10-13T00:00:20.000Z"), timeoutMs: -1 },
  );

  assert.equal(status.heartbeatTimeoutMs, 30_000);
  assert.equal(status.status, "online");
});
