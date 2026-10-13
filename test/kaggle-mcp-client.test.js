import test from "node:test";
import assert from "node:assert/strict";
import { getKaggleStatus, verifyKaggleMcp } from "../src/kaggle-mcp-client.js";

const token = "KGAT_zoz_pro_test_token_123456";

test("Kaggle connector defaults disconnected and never contacts remote service in status", () => {
  const status = getKaggleStatus({ env: {} });
  assert.equal(status.status, "not_connected");
  assert.equal(status.verified, false);
  assert.equal(status.endpoint, "https://www.kaggle.com/mcp");
  assert.equal(status.quota.amount, 30);
  assert.equal(status.quota.period, "week");
  assert.equal(status.costGuard.statusCheckContactsKaggle, false);
  assert.equal(JSON.stringify(status).includes(token), false);
});

test("Kaggle MCP verification requires a separate ZOZ Pro token before network access", async () => {
  let contacted = false;
  await assert.rejects(
    verifyKaggleMcp({ env: {}, fetchImpl: async () => { contacted = true; throw new Error("should not call"); } }),
    (error) => error.code === "kaggle_not_configured",
  );
  assert.equal(contacted, false);
});

test("Kaggle MCP verification only initializes and lists tools, never calls a tool", async () => {
  const requests = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, options, body });
    const headers = new Headers({ "content-type": "application/json", "Mcp-Session-Id": "session-test" });
    if (body.method === "initialize") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2025-06-18",
          serverInfo: { name: "Kaggle MCP" },
          capabilities: { tools: {} },
        },
      }), { status: 200, headers });
    }
    if (body.method === "notifications/initialized") {
      return new Response("", { status: 202, headers });
    }
    if (body.method === "tools/list") {
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: [{ name: "notebook_list", description: "List notebooks" }] },
      }), { status: 200, headers });
    }
    throw new Error("Unexpected method " + body.method);
  };

  const result = await verifyKaggleMcp({
    env: { ZOZ_PRO_KAGGLE_MCP_TOKEN: token },
    fetchImpl,
  });
  assert.equal(result.status, "connected");
  assert.equal(result.verified, true);
  assert.equal(result.toolCount, 1);
  assert.equal(result.costGuard.notebookStarted, false);
  assert.equal(result.costGuard.gpuQuotaConsumed, false);
  assert.deepEqual(requests.map((request) => request.body.method), [
    "initialize",
    "notifications/initialized",
    "tools/list",
  ]);
  assert.ok(requests.every((request) => request.url === "https://www.kaggle.com/mcp"));
  assert.ok(requests.every((request) => request.options.redirect === "error"));
  assert.ok(requests.every((request) => request.options.headers.authorization === "Bearer " + token));
  assert.equal(JSON.stringify(result).includes(token), false);
});

test("Kaggle MCP verification reports auth rejection without leaking token", async () => {
  await assert.rejects(
    verifyKaggleMcp({
      env: { ZOZ_PRO_KAGGLE_MCP_TOKEN: token },
      fetchImpl: async () => new Response("unauthorized", { status: 401 }),
    }),
    (error) => error.code === "kaggle_auth_rejected" && !error.message.includes(token),
  );
});
