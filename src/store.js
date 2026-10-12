import fs from "node:fs/promises";
import path from "node:path";
import { createInitialState, validateState } from "./domain.js";

export function getDefaultStateFile() {
  return path.resolve(
    process.env.ZOZ_DATA_DIR ?? path.join(process.cwd(), "data"),
    "zoz-pro-state.json",
  );
}

export const DEFAULT_STATE_FILE = getDefaultStateFile();

export class StateWriteConflictError extends Error {
  constructor() {
    super("Persistent state changed during this request. Reload the latest state and retry.");
    this.name = "StateWriteConflictError";
    this.code = "state_write_conflict";
  }
}

export function isStateWriteConflict(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.response?.status);
  const code = String(error?.code ?? "");
  const name = String(error?.name ?? "");
  const message = String(error?.message ?? "");
  return status === 412
    || /precondition/i.test(code)
    || /precondition/i.test(name)
    || /precondition|etag.*(?:mismatch|conflict|match)|(?:mismatch|conflict).*etag/i.test(message);
}

function getVercelStatePath() {
  if (process.env.VERCEL_ENV === "production") return "state/production/zoz-pro-state.json";

  const branch = String(process.env.VERCEL_GIT_COMMIT_REF ?? process.env.VERCEL_ENV ?? "preview")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "preview";

  return `state/preview/${branch}/zoz-pro-state.json`;
}

function createVercelBlobStore() {
  const pathname = getVercelStatePath();
  let etag = null;

  async function getSdk() {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      throw new Error("BLOB_READ_WRITE_TOKEN is required for durable Vercel state. Local file fallback is disabled in Vercel.");
    }
    return import("@vercel/blob");
  }

  async function readCurrent() {
    const { get } = await getSdk();
    return get(pathname, { access: "private" });
  }

  async function parseCurrent(result) {
    if (!result) return null;
    if (result.statusCode !== 200 || !result.stream) {
      throw new Error("Vercel Blob returned no readable state stream.");
    }
    const raw = await new Response(result.stream).text();
    const state = JSON.parse(raw);
    validateState(state);
    etag = result.blob?.etag ?? result.etag ?? null;
    return state;
  }

  return {
    async load() {
      const result = await readCurrent();
      const existing = await parseCurrent(result);
      if (existing) return existing;

      // First-writer wins on initialization. If two cold starts race, read back
      // the state that was created first instead of overwriting it.
      const initial = createInitialState();
      try {
        await this.save(initial);
        return initial;
      } catch (writeError) {
        const raced = await readCurrent().catch(() => null);
        const recovered = await parseCurrent(raced).catch(() => null);
        if (recovered) return recovered;
        throw writeError;
      }
    },

    async save(state) {
      validateState(state);
      const { put } = await getSdk();
      const options = {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: Boolean(etag),
        contentType: "application/json",
      };
      if (etag) options.ifMatch = etag;

      let saved;
      try {
        saved = await put(pathname, JSON.stringify(state, null, 2) + "\n", options);
      } catch (error) {
        if (isStateWriteConflict(error)) throw new StateWriteConflictError();
        throw error;
      }
      etag = saved.etag;
    },
  };
}

function createFileStateStore(filePath) {
  return {
    async load() {
      try {
        const raw = await fs.readFile(filePath, "utf8");
        const state = JSON.parse(raw);
        validateState(state);
        return state;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        const state = createInitialState();
        await this.save(state);
        return state;
      }
    },

    async save(state) {
      validateState(state);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      const tempPath = `${filePath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(state, null, 2) + "\n", "utf8");
      await fs.rename(tempPath, filePath);
    },
  };
}

export function createStateStore(filePath) {
  // Explicit file paths are used by isolated tests and local tooling.
  if (filePath !== undefined) return createFileStateStore(filePath);

  // Never rely on optional Vercel system variables to choose durable storage.
  const vercelRuntime = process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
  if (vercelRuntime || process.env.ZOZ_PRO_STORAGE_MODE === "blob") {
    return createVercelBlobStore();
  }

  // Local/test use defaults to files only outside production. A production
  // deployment with missing runtime indicators must fail closed, not use disk.
  if (process.env.NODE_ENV !== "production" && process.env.ZOZ_PRO_STORAGE_MODE !== "blob") {
    return createFileStateStore(getDefaultStateFile());
  }

  throw new Error(
    "ZOZ_PRO_STORAGE_MODE=blob is required for production state; ephemeral local storage is disabled.",
  );
}
