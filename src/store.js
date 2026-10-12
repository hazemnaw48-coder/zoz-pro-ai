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

      const saved = await put(pathname, JSON.stringify(state, null, 2) + "\n", options);
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
  // Vercel functions are ephemeral: never silently write to a local JSON file.
  if (filePath === undefined && process.env.VERCEL === "1") {
    return createVercelBlobStore();
  }
  return createFileStateStore(filePath ?? getDefaultStateFile());
}
