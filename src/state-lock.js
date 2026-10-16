import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { StateWriteConflictError } from "./state-errors.js";
import { normalizeBlobEtag } from "./blob-etag.js";

const DEFAULT_LEASE_MS = 30000;
const DEFAULT_HEARTBEAT_MS = 5000;
// Wait longer than a full lease so an abandoned lock can expire before returning 409.
const DEFAULT_WAIT_TIMEOUT_MS = DEFAULT_LEASE_MS + 5000;

function shouldUseDistributedLock() {
  return process.env.VERCEL === "1"
    || Boolean(process.env.VERCEL_ENV)
    || process.env.ZOZ_PRO_STORAGE_MODE === "blob";
}

function getLockPath() {
  const environment = String(process.env.VERCEL_ENV ?? "development").toLowerCase();
  if (environment === "production") return "coordination/zoz-pro-state-production.lock.json";
  const branch = String(process.env.VERCEL_GIT_COMMIT_REF ?? environment)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "preview";
  return "coordination/zoz-pro-state-" + environment + "-" + branch + ".lock.json";
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isConditionalConflict(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "");
  return code === "state_write_conflict" || status === 409 || status === 412
    || /already[_ -]?exists|precondition|etag.*mismatch/i.test(code + " " + message);
}

function conflict(message, cause) {
  return new StateWriteConflictError(message, cause ? { cause } : undefined);
}

export function createStateLock(options = {}) {
  const context = new AsyncLocalStorage();
  const getClient = options.client
    ? async () => options.client
    : async () => {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        throw new Error("BLOB_READ_WRITE_TOKEN is required for the distributed state lock.");
      }
      return import("@vercel/blob");
    };
  const isEnabled = () => typeof options.enabled === "function"
    ? options.enabled()
    : (options.enabled ?? shouldUseDistributedLock());
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? wait;
  const random = options.random ?? Math.random;
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const waitTimeoutMs = options.waitTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS;
  const pathname = options.pathname ?? getLockPath;

  async function readLock(path) {
    const client = await getClient();
    const response = await client.get(path, { access: "private", useCache: false });
    if (!response || response.statusCode !== 200 || !response.stream) return null;
    const raw = await new Response(response.stream).text();
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      record = null;
    }
    // Use the same canonical metadata ETag source as PUT, rather than
    // passing the GET response-header representation directly to ifMatch.
    const getEtag = response.blob?.etag ?? response.etag ?? null;
    const metadata = await client.head(path);
    const metadataEtag = metadata?.etag ?? null;
    if (!normalizeBlobEtag(getEtag) || !normalizeBlobEtag(metadataEtag)) {
      throw new Error("The state lock did not include a usable Blob ETag.");
    }
    if (normalizeBlobEtag(getEtag) !== normalizeBlobEtag(metadataEtag)) {
      throw conflict("The state lock changed while its version was being read.");
    }
    return { record, etag: metadataEtag };
  }

  async function acquire(path) {
    const owner = randomUUID();
    const startedAt = now();

    while (true) {
      const expiresAt = now() + leaseMs;
      let readConflict = false;
      const current = await readLock(path).catch(error => {
        if (Number(error?.status ?? error?.statusCode) === 404 || /not found/i.test(String(error?.message ?? ""))) return null;
        if (isConditionalConflict(error)) {
          readConflict = true;
          return null;
        }
        throw error;
      });
      if (readConflict) {
        if (now() - startedAt >= waitTimeoutMs) {
          const busy = conflict("Timed out waiting for a stable read of the ZOZ Pro state lock.");
          busy.lockBusy = true;
          throw busy;
        }
        await sleep(50 + Math.floor(random() * 150));
        continue;
      }
      try {
        const client = await getClient();
        let saved;
        if (!current) {
          saved = await client.put(path, JSON.stringify({ owner, expiresAt }), {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: false,
            contentType: "application/json",
          });
        } else if (Number(current.record?.expiresAt) <= now()) {
          // Claim an expired lease with compare-and-swap; never delete a lock
          // because Blob delete does not provide the same portable ETag guard.
          saved = await client.put(path, JSON.stringify({ owner, expiresAt }), {
            access: "private",
            addRandomSuffix: false,
            allowOverwrite: true,
            ifMatch: current.etag,
            contentType: "application/json",
          });
        } else {
          saved = null;
        }
        if (saved) return { pathname: path, owner, expiresAt, etag: saved.etag, renewalError: null, lost: false };
      } catch (error) {
        if (!isConditionalConflict(error)) throw error;
      }

      if (now() - startedAt >= waitTimeoutMs) {
        const busy = conflict("Timed out waiting for the ZOZ Pro state lock.");
        busy.lockBusy = true;
        throw busy;
      }
      await sleep(50 + Math.floor(random() * 150));
    }
  }

  async function renew(lock) {
    if (lock.lost) throw conflict("The ZOZ Pro state lock was lost.");
    const current = await readLock(lock.pathname);
    if (!current || current.record?.owner !== lock.owner || Number(current.record?.expiresAt) <= now()) {
      lock.lost = true;
      throw conflict("The ZOZ Pro state lock is no longer owned by this request.");
    }

    const expiresAt = now() + leaseMs;
    const client = await getClient();
    const saved = await client.put(lock.pathname, JSON.stringify({ owner: lock.owner, expiresAt }), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      ifMatch: current.etag,
      contentType: "application/json",
    });
    lock.expiresAt = expiresAt;
    lock.etag = saved.etag;
  }

  async function assertOwned() {
    if (!isEnabled()) return true;
    const lock = context.getStore();
    if (!lock) {
      throw conflict("A distributed state lock is required before writing persistent ZOZ Pro state.");
    }
    if (lock.lost || lock.renewalError) {
      throw conflict("The ZOZ Pro state lock was lost before the state write.", lock.renewalError);
    }
    const current = await readLock(lock.pathname);
    if (!current || current.record?.owner !== lock.owner || Number(current.record?.expiresAt) <= now()) {
      lock.lost = true;
      throw conflict("The ZOZ Pro state lock is no longer owned by this request.");
    }
    return true;
  }

  async function release(lock) {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const current = await readLock(lock.pathname);
        if (!current || current.record?.owner !== lock.owner) return;
        // Mark the lease expired with ETag-conditional overwrite. The next
        // acquirer can atomically claim it; no unconditional delete is used.
        const client = await getClient();
        await client.put(lock.pathname, JSON.stringify({ owner: lock.owner, expiresAt: 0 }), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          ifMatch: current.etag,
          contentType: "application/json",
        });
        return;
      } catch (error) {
        if (isConditionalConflict(error)) {
          // A concurrent heartbeat may update the same owner's ETag between
          // GET and HEAD. Re-read and release only if we still own the lock.
          if (attempt < 5) {
            await sleep(25 + Math.floor(random() * 75));
            continue;
          }
          return;
        }
        const rawMessage = String(error?.message ?? "");
        const safeMessage = rawMessage
          .replace(/https?:\/\/[^\s"'\x60]+/gi, "[url]")
          .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
          .replace(/(token|authorization)\s*[:=]\s*[^,\s]+/gi, "$1=[redacted]")
          .slice(0, 180);
        console.warn("Could not release the ZOZ Pro state lock; it will expire automatically.", {
          errorName: error?.name ?? null,
          errorStatus: error?.status ?? error?.statusCode ?? error?.response?.status ?? null,
          errorCode: typeof error?.code === "string" ? error.code.slice(0, 80) : null,
          safeMessage,
        });
        return;
      }
    }
  }

  async function withLock(operation) {
    if (!isEnabled()) return operation();
    const existing = context.getStore();
    if (existing) {
      await assertOwned();
      return operation();
    }

    const path = typeof pathname === "function" ? pathname() : pathname;
    const lock = await acquire(path);
    let renewalChain = Promise.resolve();
    const timer = setInterval(() => {
      renewalChain = renewalChain
        .then(() => renew(lock))
        .catch(error => { lock.renewalError = error; });
    }, heartbeatMs);
    timer.unref?.();

    try {
      return await context.run(lock, operation);
    } finally {
      clearInterval(timer);
      await renewalChain;
      await release(lock);
    }
  }

  return { withLock, assertOwned };
}

const runtimeLock = createStateLock();

export function withStateLock(operation) {
  return runtimeLock.withLock(operation);
}

export function assertStateLockOwnership() {
  return runtimeLock.assertOwned();
}
