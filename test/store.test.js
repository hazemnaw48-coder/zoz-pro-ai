import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInitialState } from "../src/domain.js";
import { createStateStore } from "../src/store.js";

test("state store creates and reloads durable state", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-"));
  const file = path.join(dir, "state.json");
  const store = createStateStore(file);

  const first = await store.load();
  first.project.lastAgent = "Codex";
  first.project.lastVerifiedCommit = "abc123";
  await store.save(first);

  const second = await store.load();
  assert.equal(second.project.lastVerifiedCommit, "abc123");
  assert.equal(second.project.lastAgent, "Codex");
  await fs.rm(dir, { recursive: true, force: true });
});

test("state store rejects a wrong repository boundary", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-"));
  const file = path.join(dir, "state.json");
  const store = createStateStore(file);
  const state = createInitialState();
  state.project.repository = "zozaimanager2026-design/zoz-ai-control";
  await assert.rejects(() => store.save(state), /State repository boundary is invalid/);
  await fs.rm(dir, { recursive: true, force: true });
});
