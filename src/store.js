import fs from "node:fs/promises";
import path from "node:path";
import { get, head, put } from "@vercel/blob";
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

function isBlobMissing(error) {
  const message = String(error?.message ?? error);
  return /not found|404|BlobNotFound/i.test(message);
}

function createCloudStateStore() {
  // Each request gets its own expected ETag. Conditional writes prevent one
  // request from silently overwriting a newer state snapshot.
  let expectedEtag = null;

  return {
    async load() {
      let metadata;
      try {
        metadata = await head(CLOUD_STATE_PATH);
      } catch (error) {
        if (!isBlobMissing(error)) throw error;

        const initialState = createInitialState();
        const created = await put(
          CLOUD_STATE_PATH,
          JSON.stringify(initialState, null, 2) + "\n",
          {
            access: "private",
            allowOverwrite: true,
            addRandomSuffix: false,
            contentType: "application/json",
          },
        );
        expectedEtag = created.etag ?? null;
        return initialState;
      }

      expectedEtag = metadata.etag ?? null;
      const result = await get(CLOUD_STATE_PATH, { access: "private" });
      if (!result) throw new Error("ZOZ Pro cloud state disappeared during read.");
      const raw = await new Response(result.stream).text();
      const state = JSON.parse(raw);
      validateState(state);
      return state;
    },

    async save(state) {
      validateState(state);
      const options = {
        access: "private",
        allowOverwrite: true,
        addRandomSuffix: false,
        contentType: "application/json",
      };
      if (expectedEtag) options.ifMatch = expectedEtag;

      const saved = await put(
        CLOUD_STATE_PATH,
        JSON.stringify(state, null, 2) + "\n",
        options,
      );
      expectedEtag = saved.etag ?? expectedEtag;
    },
  };
}

export function createStateStore(filePath) {
  if (filePath === undefined && useCloudStore()) {
    return createCloudStateStore();
  }

  const stateFile = filePath ?? getDefaultStateFile();
  return {
    async load() {
      try {
        const raw = await fs.readFile(stateFile, "utf8");
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
      await fs.mkdir(path.dirname(stateFile), { recursive: true });
      const tempPath = `${stateFile}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(state, null, 2) + "\n", "utf8");
      await fs.rename(tempPath, stateFile);
    },
  };
}
