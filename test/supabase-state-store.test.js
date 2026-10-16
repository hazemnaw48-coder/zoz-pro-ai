import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/domain.js";
import { createSupabaseStateStore } from "../src/supabase-state-store.js";

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function response(value, status = 200) { return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } }); }
function dbWith(row = null) {
  let current = row ? clone(row) : null;
  const requests = [];
  return {
    requests,
    current: () => current ? clone(current) : null,
    fetch: async (input, init = {}) => {
      const url = new URL(String(input)), method = init.method || "GET";
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ url: String(input), method, headers: new Headers(init.headers), body });
      if (method === "GET") return response(current ? [clone(current)] : []);
      if (method === "POST") {
        if (current) return response([]);
        current = { ...clone(body), updated_at: new Date().toISOString() };
        return response([clone(current)], 201);
      }
      if (method === "PATCH") {
        if (!current || url.searchParams.get("version") !== "eq." + current.version) return response([]);
        current = { ...current, ...clone(body) };
        return response([clone(current)]);
      }
      return response({}, 405);
    },
  };
}
const env = extra => ({ SUPABASE_URL: "https://isolated-preview.supabase.co", SUPABASE_SECRET_KEY: "test-secret-never-log", VERCEL_ENV: "preview", ...extra });
const row = (state = createInitialState(), version = 1) => ({ singleton: true, version, state: clone(state), updated_at: new Date().toISOString() });

test("Preview initialization is explicit and versioned; production never seeds empty state", async () => {
  const db = dbWith();
  const store = createSupabaseStateStore({ env: env({ ZOZ_PRO_SUPABASE_ALLOW_EMPTY_PREVIEW_INIT: "true" }), fetchImpl: db.fetch });
  assert.equal((await store.load()).project.repository, "hazemnaw48-coder/zoz-pro-ai");
  assert.equal(db.current().version, 1);
  const prodDb = dbWith();
  const prod = createSupabaseStateStore({ env: env({ VERCEL_ENV: "production", ZOZ_PRO_SUPABASE_ALLOW_EMPTY_PREVIEW_INIT: "true" }), fetchImpl: prodDb.fetch });
  await assert.rejects(prod.load(), e => e.code === "supabase_state_not_initialized");
  assert.equal(prodDb.current(), null);
});

test("missing credentials and denied reads fail closed without Blob fallback or secret leakage", async () => {
  let calls = 0;
  const missing = createSupabaseStateStore({ env: {}, fetchImpl: async () => { calls++; return response([]); } });
  await assert.rejects(missing.load(), e => e.code === "supabase_configuration_missing");
  assert.equal(calls, 0);
  const denied = createSupabaseStateStore({ env: env(), fetchImpl: async () => { calls++; return response({ message: "private detail" }, 403); } });
  await assert.rejects(denied.load(), e => e.code === "supabase_access_denied" && !e.message.includes("private detail"));
  assert.equal(calls, 1);
});

test("concurrent saves use version CAS and reject stale writers", async () => {
  const db = dbWith(row());
  const a = createSupabaseStateStore({ env: env(), fetchImpl: db.fetch });
  const b = createSupabaseStateStore({ env: env(), fetchImpl: db.fetch });
  const sa = await a.load(), sb = await b.load();
  sa.project.lastAgent = "A"; sb.project.lastAgent = "B";
  const outcomes = await Promise.allSettled([a.save(sa), b.save(sb)]);
  assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(outcomes.find(x => x.status === "rejected").reason.code, "state_write_conflict");
  assert.equal(db.current().version, 2);
});

test("completed task result persists and reads back through a new store instance", async () => {
  const state = createInitialState();
  state.tasks[0].status = "verification";
  state.tasks[0].result = "health-check completed";
  state.controlCommands.push({ id: "CMD-TEST", taskId: state.tasks[0].id, status: "completed", instruction: "system:health-check", result: "health-check completed" });
  const db = dbWith(row(state, 7));
  const writer = createSupabaseStateStore({ env: env(), fetchImpl: db.fetch });
  const loaded = await writer.load();
  loaded.executor.lastCompletedCommandId = "CMD-TEST";
  await writer.save(loaded);
  const reader = createSupabaseStateStore({ env: env(), fetchImpl: db.fetch });
  const saved = await reader.load();
  assert.equal(saved.controlCommands[0].status, "completed");
  assert.equal(saved.controlCommands[0].result, "health-check completed");
  assert.equal(saved.tasks[0].result, "health-check completed");
  assert.equal(saved.executor.lastCompletedCommandId, "CMD-TEST");
  assert.equal(db.current().version, 8);
});
