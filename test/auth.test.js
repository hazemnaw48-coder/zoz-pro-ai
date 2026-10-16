import test from "node:test";
import assert from "node:assert/strict";
import { isAuthorized, getControlToken } from "../src/auth.js";

test("control auth accepts either configured scoped token without breaking legacy token", () => {
  const previousProd = process.env.ZOZ_CONTROL_TOKEN;
  const previousScoped = process.env.ZOZ_PRO_CONTROL_TOKEN;
  try {
    process.env.ZOZ_CONTROL_TOKEN = "production-control-token";
    process.env.ZOZ_PRO_CONTROL_TOKEN = "scoped-smoke-token";
    assert.equal(getControlToken(), "scoped-smoke-token");
    assert.equal(isAuthorized({ headers: { authorization: "Bearer production-control-token" } }), true);
    assert.equal(isAuthorized({ headers: { authorization: "Bearer scoped-smoke-token" } }), true);
    assert.equal(isAuthorized({ headers: { authorization: "Bearer invalid-token" } }), false);
    assert.equal(isAuthorized({ headers: {} }), false);
  } finally {
    if (previousProd === undefined) delete process.env.ZOZ_CONTROL_TOKEN;
    else process.env.ZOZ_CONTROL_TOKEN = previousProd;
    if (previousScoped === undefined) delete process.env.ZOZ_PRO_CONTROL_TOKEN;
    else process.env.ZOZ_PRO_CONTROL_TOKEN = previousScoped;
  }
});
