import fs from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import { createInitialState, validateState } from "./domain.js";

const CLOUD_STATE_PATH = "state/zoz-pro-state.json";

export function getDefaultStateFile() {
  return path.resolve(
    process.env.ZOZ_DATA_DIR ?? path.join(process.cwd(), "data"),
    "zoz-pro-state.json",
  );
}

export const DEFAULT_STATE_FILE = getDefaultStateFile();

function useCloudStore() {
  return Boolean(process.env.VERCEL || process.env.ZOZ_CLOUD_STATE === "true");
}

async function loadCloudState() {
  try {
    const result = await get(CLOUD_STATE_PATH, {
      access: "private",
      useCache: false,
    });
    if (!result) throw new Error("cloud state not found");
    const raw = await new Response(result.stream).text();
    const state = JSON.parse(raw);
    validateState(state);
    return state;
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!/not found|404|BlobNotFound/i.test(message)) throw error;
    const state = createInitialState();
    await saveCloudState(state);
    return state;
  }
}

async function saveCloudState(state) {
  validateState(state);
  await put(
    CLOUD_STATE_PATH,
    JSON.stringify(state, null, 2) + "\n",
    {
      access: "private",
      allowOverwrite: true,
      addRandomSuffix: false,
      contentType: "application/json",
    },
  );
}

export function createStateStore(filePath = getDefaultStateFile()) {
  if (useCloudStore()) return { load: loadCloudState, save: saveCloudState };

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
