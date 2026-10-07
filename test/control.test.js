import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

test("mobile control queue persists normal commands and blocks risky commands pending approval", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-control-"));
  process.env.ZOZ_DATA_DIR = dir;
  const { server } = await import("../src/server.js");
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;

  try {
    const normal = await fetch(`http://127.0.0.1:${port}/api/control/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ instruction: "Review ZP-001 and report findings." }),
    });
    assert.equal(normal.status, 201);
    const normalCommand = await normal.json();
    assert.equal(normalCommand.status, "queued");

    const risky = await fetch(`http://127.0.0.1:${port}/api/control/commands`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        instruction: "Deploy the application.",
        actionType: "production_affecting",
      }),
    });
    assert.equal(risky.status, 201);
    const riskyCommand = await risky.json();
    assert.equal(riskyCommand.status, "awaiting_approval");

    const state = await (await fetch(`http://127.0.0.1:${port}/api/state`)).json();
    assert.equal(state.controlCommands.length, 2);
    assert.equal(state.controlCommands[0].instruction, "Deploy the application.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.ZOZ_DATA_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
