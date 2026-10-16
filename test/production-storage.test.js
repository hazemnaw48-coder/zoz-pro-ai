import test from "node:test";
import assert from "node:assert/strict";
import { StateWriteConflictError, createStateStore, isStateWriteConflict } from "../src/store.js";

test("production fails closed when optional platform variables are unavailable", () => {
  const keys = ["NODE_ENV", "VERCEL", "VERCEL_ENV", "ZOZ_PRO_STORAGE_MODE", "ZOZ_PRO_STATE_BACKEND"];
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    process.env.NODE_ENV = "production";
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    delete process.env.ZOZ_PRO_STORAGE_MODE;
    delete process.env.ZOZ_PRO_STATE_BACKEND;
    assert.throws(
      () => createStateStore(),
      /ZOZ_PRO_STATE_BACKEND must explicitly select supabase or blob for production state/,
    );
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("Blob conditional write conflicts are recognized and surfaced as retryable", () => {
  assert.equal(isStateWriteConflict({ status: 412 }), true);
  assert.equal(isStateWriteConflict({ code: "precondition_failed" }), true);
  assert.equal(isStateWriteConflict(new Error("ETag mismatch on conditional write")), true);

  const error = new StateWriteConflictError();
  assert.equal(error.code, "state_write_conflict");
  assert.match(error.message, /Reload the latest state and retry/);
});

test("ordinary Blob errors are not mislabeled as retryable conflicts", () => {
  assert.equal(isStateWriteConflict({ status: 500, message: "Internal error" }), false);
});
