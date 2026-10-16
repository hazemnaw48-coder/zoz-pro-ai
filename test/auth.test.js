import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorized, getControlToken } from "../src/auth.js";

const KEYS = [
  "ZOZ_CONTROL_TOKEN",
  "ZOZ_PRO_CONTROL_TOKEN",
  "ZOZ_PRO_PREVIEW_CONTROL_TOKEN",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_REF",
];

function snapshot() {
  return Object.fromEntries(KEYS.map(key => [key, process.env[key]]));
}
function restore(previous) {
  for (const key of KEYS) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
}

test("control auth accepts either configured scoped token without breaking legacy token", () => {
  const previous = snapshot();
  try {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_GIT_COMMIT_REF;
    delete process.env.ZOZ_PRO_PREVIEW_CONTROL_TOKEN;
    process.env.ZOZ_CONTROL_TOKEN = "production-control-token";
    process.env.ZOZ_PRO_CONTROL_TOKEN = "scoped-smoke-token";
    assert.equal(getControlToken(), "scoped-smoke-token");
    assert.equal(isAuthorized({ headers: { authorization: "Bearer production-control-token" } }), true);
    assert.equal(isAuthorized({ headers: { authorization: "Bearer scoped-smoke-token" } }), true);
    assert.equal(isAuthorized({ headers: { authorization: "Bearer invalid-token" } }), false);
    assert.equal(isAuthorized({ headers: {} }), false);
  } finally {
    restore(previous);
  }
});

test("dedicated ZP-018 Preview token is accepted only on its exact Vercel Preview branch", () => {
  const previous = snapshot();
  try {
    delete process.env.ZOZ_CONTROL_TOKEN;
    delete process.env.ZOZ_PRO_CONTROL_TOKEN;
    process.env.ZOZ_PRO_PREVIEW_CONTROL_TOKEN = "preview-only-control-token";
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_REF = "fix/ZP-018-serialized-state-writes";

    assert.equal(getControlToken(), "preview-only-control-token");
    assert.equal(isAuthorized({ headers: { authorization: "Bearer preview-only-control-token" } }), true);

    process.env.VERCEL_GIT_COMMIT_REF = "feature/ZP-012-vercel-cloud-runtime";
    assert.equal(getControlToken(), "");
    assert.equal(isAuthorized({ headers: { authorization: "Bearer preview-only-control-token" } }), false);

    process.env.VERCEL_GIT_COMMIT_REF = "fix/ZP-018-serialized-state-writes";
    process.env.VERCEL_ENV = "production";
    assert.equal(getControlToken(), "");
    assert.equal(isAuthorized({ headers: { authorization: "Bearer preview-only-control-token" } }), false);
  } finally {
    restore(previous);
  }
});
