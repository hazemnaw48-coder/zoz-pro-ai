import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import {
  normalizeHandoffDirection,
  sanitizeHandoffFilename,
  saveInlineHandoff,
  listHandoffFiles,
  openHandoffFile,
  validateStudioOutputUrl,
} from "../src/file-handoff.js";

test("handoff accepts only explicit directions and safe file types", () => {
  assert.equal(normalizeHandoffDirection("from-gemini"), "from-gemini");
  assert.equal(sanitizeHandoffFilename("../../pyramid final.mp4"), "pyramid-final.mp4");
  assert.throws(() => normalizeHandoffDirection("from-claude"), /direction/);
  assert.throws(() => sanitizeHandoffFilename("payload.exe"), /not allowed/);
  assert.throws(() => sanitizeHandoffFilename(""), /filename/);
});

test("handoff validates same-origin HTTPS Studio output URLs", () => {
  const env = { ZOZ_CONTENT_STUDIO_URL: "https://studio.example.com" };
  assert.equal(
    validateStudioOutputUrl("https://studio.example.com/outputs/job-123/video.mp4", env).pathname,
    "/outputs/job-123/video.mp4",
  );
  assert.throws(
    () => validateStudioOutputUrl("https://evil.example.com/outputs/job-123/video.mp4", env),
    /match_configured_https_studio/,
  );
  assert.throws(
    () => validateStudioOutputUrl("http://studio.example.com/outputs/job-123/video.mp4", env),
    /match_configured_https_studio/,
  );
  assert.throws(
    () => validateStudioOutputUrl("https://studio.example.com/private/state.json", env),
    /studio_output/,
  );
});

test("handoff stores, lists, hashes, and retrieves a file privately in local test mode", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "zoz-pro-handoff-"));
  const oldDir = process.env.ZOZ_DATA_DIR;
  const oldCloud = process.env.ZOZ_CLOUD_STATE;
  const oldVercel = process.env.VERCEL;
  process.env.ZOZ_DATA_DIR = dir;
  delete process.env.ZOZ_CLOUD_STATE;
  delete process.env.VERCEL;
  try {
    const payload = Buffer.from("Gemini handoff test file\n", "utf8");
    const saved = await saveInlineHandoff({
      direction: "from-gemini",
      filename: "handoff-test.txt",
      contentBase64: payload.toString("base64"),
      contentType: "text/plain",
    });
    assert.equal(saved.size, payload.length);
    assert.equal(saved.sha256.length, 64);
    assert.equal(saved.direction, "from-gemini");

    const files = await listHandoffFiles("from-gemini");
    assert.equal(files.length, 1);
    assert.equal(files[0].pathname, saved.pathname);

    const file = await openHandoffFile(saved.pathname);
    const chunks = [];
    for await (const chunk of file.stream) chunks.push(Buffer.from(chunk));
    assert.deepEqual(Buffer.concat(chunks), payload);
    assert.equal(file.contentType, "text/plain; charset=utf-8");
    await assert.rejects(() => openHandoffFile("../../data/zoz-pro-state.json"), /invalid handoff pathname/);
  } finally {
    if (oldDir === undefined) delete process.env.ZOZ_DATA_DIR; else process.env.ZOZ_DATA_DIR = oldDir;
    if (oldCloud === undefined) delete process.env.ZOZ_CLOUD_STATE; else process.env.ZOZ_CLOUD_STATE = oldCloud;
    if (oldVercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = oldVercel;
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("handoff rejects files over the inline limit", async () => {
  const tooLarge = Buffer.alloc(3 * 1024 * 1024 + 1);
  await assert.rejects(
    () => saveInlineHandoff({
      direction: "from-gemini",
      filename: "too-large.zip",
      contentBase64: tooLarge.toString("base64"),
    }),
    /inline_file_limit_exceeded/,
  );
});
