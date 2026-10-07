import fs from "node:fs/promises";
import path from "node:path";
import { createInitialState, validateState } from "./domain.js";

export const DEFAULT_STATE_FILE = path.resolve(
  process.env.ZOZ_DATA_DIR ?? path.join(process.cwd(), "data"),
  "zoz-pro-state.json",
);

export function createStateStore(filePath = DEFAULT_STATE_FILE) {
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
