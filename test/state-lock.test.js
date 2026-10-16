import test from "node:test";
import assert from "node:assert/strict";
import { createStateLock } from "../src/state-lock.js";

function makeBlobClient() {
  let current = null;
  let version = 0;
  function error(message, status, code) {
    return Object.assign(new Error(message), { status, code });
  }
  return {
    async put(_path, body, options = {}) {
      if (current && !options.allowOverwrite) {
        throw error("blob already exists", 409, "blob_already_exists");
      }
      if (options.ifMatch && (!current || current.etag !== options.ifMatch)) {
        throw error("precondition failed", 412, "blob_precondition_failed");
      }
      current = { body: String(body), etag: "etag-" + (++version) };
      return { etag: current.etag };
    },
    async get() {
      if (!current) return null;
      return {
        statusCode: 200,
        stream: new Response(current.body).body,
        blob: { etag: `"${current.etag}"` },
      };
    },
    async head() {
      if (!current) throw error("blob not found", 404, "not_found");
      return { etag: current.etag };
    },
    async del(_path, options = {}) {
      if (!current) return;
      if (options.ifMatch && current.etag !== options.ifMatch) {
        throw error("precondition failed", 412, "blob_precondition_failed");
      }
      current = null;
    },
  };
}

function createTestLock(client) {
  return createStateLock({
    client,
    enabled: true,
    pathname: "state-lock-test.json",
    leaseMs: 600,
    heartbeatMs: 100,
    waitTimeoutMs: 3000,
  });
}

test("distributed lock serializes concurrent callers across independent lock instances", async () => {
  const client = makeBlobClient();
  const locks = [createTestLock(client), createTestLock(client), createTestLock(client)];
  let active = 0;
  let maximumActive = 0;
  const order = [];

  await Promise.all(locks.map((lock, index) => lock.withLock(async () => {
    await lock.assertOwned();
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, 25));
    order.push(index);
    active -= 1;
  })));

  assert.equal(maximumActive, 1);
  assert.equal(order.length, 3);
  assert.deepEqual(new Set(order), new Set([0, 1, 2]));
});

test("distributed lock renews leases while a critical section is active", async () => {
  const client = makeBlobClient();
  const first = createTestLock(client);
  const second = createTestLock(client);
  let active = 0;
  let maximumActive = 0;

  const work = (lock, duration) => lock.withLock(async () => {
    await lock.assertOwned();
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise(resolve => setTimeout(resolve, duration));
    await lock.assertOwned();
    active -= 1;
  });

  await Promise.all([work(first, 850), work(second, 15)]);
  assert.equal(maximumActive, 1);
});
