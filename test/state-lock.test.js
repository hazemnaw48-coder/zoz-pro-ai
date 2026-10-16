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
    replaceCurrent(body) {
      current = { body: String(body), etag: "etag-" + (++version) };
    },
    inspectCurrent() {
      return current ? { ...current } : null;
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

test("default acquisition wait allows an abandoned 30-second lease to expire", async () => {
  const client = makeBlobClient();
  let now = 0;
  await client.put("state-lock-expiry-test.json", JSON.stringify({
    owner: "previous-invocation",
    expiresAt: 15000,
  }), { access: "private", addRandomSuffix: false, allowOverwrite: false });

  const lock = createStateLock({
    client,
    enabled: true,
    pathname: "state-lock-expiry-test.json",
    now: () => now,
    sleep: async milliseconds => { now += milliseconds; },
    random: () => 0,
  });

  await lock.withLock(async () => {
    assert.ok(now >= 15000, "the stale owner lease must expire before this request acquires the lock");
    await lock.assertOwned();
  });
});

test("acquisition preserves a newer owner if the conditional claim races", async () => {
  const client = makeBlobClient();
  let now = 0;
  await client.put("state-lock-test.json", JSON.stringify({
    owner: "expired-owner",
    expiresAt: 0,
  }), { access: "private", addRandomSuffix: false, allowOverwrite: false });

  const originalPut = client.put.bind(client);
  let injected = false;
  let preservedWhileActive = false;
  const originalGet = client.get.bind(client);
  client.get = async (...args) => {
    const current = client.inspectCurrent();
    if (now < 100 && current && JSON.parse(current.body).owner === "intervening-owner") {
      preservedWhileActive = true;
    }
    return originalGet(...args);
  };
  client.put = async (path, body, options = {}) => {
    if (!injected && options.ifMatch) {
      injected = true;
      client.replaceCurrent(JSON.stringify({
        owner: "intervening-owner",
        expiresAt: now + 100,
      }));
    }
    return originalPut(path, body, options);
  };

  const lock = createStateLock({
    client,
    enabled: true,
    pathname: "state-lock-test.json",
    now: () => now,
    sleep: async milliseconds => { now += milliseconds; },
    random: () => 0,
  });
  await lock.withLock(async () => {
    await lock.assertOwned();
    assert.notEqual(JSON.parse(client.inspectCurrent().body).owner, "expired-owner");
  });
  assert.equal(injected, true);
  assert.equal(preservedWhileActive, true, "the competing owner must remain intact until its lease expires");
});

test("lock reads use the ETag paired with the GET body without a separate HEAD", async () => {
  const client = makeBlobClient();
  let headCalls = 0;
  client.head = async () => {
    headCalls += 1;
    throw new Error("HEAD should not be required to read a state lock");
  };
  const lock = createTestLock(client);
  await lock.withLock(async () => {
    await lock.assertOwned();
  });
  assert.equal(headCalls, 0);
});

test("release preserves a newer owner when a conditional write races", async () => {
  const client = makeBlobClient();
  const lock = createTestLock(client);
  let inject = false;
  const originalPut = client.put.bind(client);
  client.put = async (path, body, options = {}) => {
    if (inject && options.ifMatch && options.allowOverwrite) {
      inject = false;
      client.replaceCurrent(JSON.stringify({
        owner: "intervening-owner",
        expiresAt: Date.now() + 60000,
      }));
    }
    return originalPut(path, body, options);
  };
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    await lock.withLock(async () => {
      await lock.assertOwned();
      inject = true;
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "ZOZ Pro state-lock conditional release conflict");
  assert.equal(warnings[0][1].stage, "conditional-put");
  assert.equal(JSON.parse(client.inspectCurrent().body).owner, "intervening-owner");
});

test("release retries a same-owner conditional write race and expires the lock promptly", async () => {
  const client = makeBlobClient();
  const lock = createTestLock(client);
  let inject = false;
  const originalPut = client.put.bind(client);
  client.put = async (path, body, options = {}) => {
    if (inject && options.ifMatch && options.allowOverwrite) {
      inject = false;
      const current = client.inspectCurrent();
      const record = JSON.parse(current.body);
      client.replaceCurrent(JSON.stringify({
        ...record,
        expiresAt: Date.now() + 30000,
      }));
    }
    return originalPut(path, body, options);
  };
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    await lock.withLock(async () => {
      await lock.assertOwned();
      inject = true;
    });
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0][0], "ZOZ Pro state-lock conditional release conflict");
  assert.equal(warnings[0][1].stage, "conditional-put");
  assert.equal(JSON.parse(client.inspectCurrent().body).expiresAt, 0);
});

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
