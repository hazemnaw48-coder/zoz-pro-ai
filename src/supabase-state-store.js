import { createInitialState, validateState } from "./domain.js";
import { StateWriteConflictError } from "./state-errors.js";

export class SupabaseStateStoreError extends Error {
  constructor(message, code, status) {
    super(message); this.name = "SupabaseStateStoreError"; this.code = code;
    if (Number.isInteger(status)) this.status = status;
  }
}

function config(env) {
  const url = String(env.SUPABASE_URL ?? "").trim();
  const key = String(env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new SupabaseStateStoreError("Supabase state requires SUPABASE_URL and a server-only secret key.", "supabase_configuration_missing");
  let parsed;
  try { parsed = new URL(url); } catch { throw new SupabaseStateStoreError("SUPABASE_URL is invalid.", "supabase_configuration_invalid"); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.pathname !== "/" && parsed.pathname !== "")) {
    throw new SupabaseStateStoreError("SUPABASE_URL must be a project HTTPS origin.", "supabase_configuration_invalid");
  }
  return { origin: parsed.origin, key };
}
function statusError(status) {
  if (status === 401 || status === 403) return new SupabaseStateStoreError("Supabase denied state access.", "supabase_access_denied", status);
  if (status === 404) return new SupabaseStateStoreError("Supabase state table is missing; apply the migration.", "supabase_schema_missing", status);
  if (status === 409 || status === 412) return new StateWriteConflictError("Supabase state changed concurrently; reload and retry.");
  if (status === 429) return new SupabaseStateStoreError("Supabase rate-limited state access.", "supabase_rate_limited", status);
  if (status >= 500) return new SupabaseStateStoreError("Supabase state backend is unavailable.", "supabase_unavailable", status);
  return new SupabaseStateStoreError("Supabase state request failed.", "supabase_request_failed", status);
}

export function createSupabaseStateStore(options = {}) {
  const env = options.env ?? process.env, fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let loadedVersion = null;
  async function request(resource, { method = "GET", body, prefer } = {}) {
    const c = config(env), headers = { apikey: c.key, Authorization: "Bearer " + c.key, Accept: "application/json" };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (prefer) headers.Prefer = prefer;
    let response;
    try {
      response = await fetchImpl(c.origin + "/rest/v1/" + resource, {
        method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        ...(typeof AbortSignal?.timeout === "function" ? { signal: AbortSignal.timeout(8000) } : {}),
      });
    } catch { throw new SupabaseStateStoreError("Supabase state backend could not be reached.", "supabase_unavailable"); }
    if (!response.ok) throw statusError(response.status);
    if (response.status === 204) return [];
    try { return await response.json(); }
    catch { throw new SupabaseStateStoreError("Supabase returned an invalid response.", "supabase_invalid_response"); }
  }
  function validateRow(row) {
    if (!row || row.singleton !== true || !/^[1-9][0-9]*$/.test(String(row.version))) {
      throw new SupabaseStateStoreError("Supabase state version is invalid.", "supabase_version_invalid");
    }
    try { if (typeof row.version === "number" && !Number.isSafeInteger(row.version)) throw Error(); BigInt(String(row.version)); validateState(row.state); }
    catch { throw new SupabaseStateStoreError("Supabase state row failed validation.", "supabase_state_invalid"); }
    return { version: String(row.version), state: row.state };
  }
  async function readRow() {
    const rows = await request("zoz_pro_state?singleton=eq.true&select=singleton,version,state,updated_at&limit=1");
    if (!Array.isArray(rows) || rows.length > 1) throw new SupabaseStateStoreError("Supabase state query returned an invalid row set.", "supabase_invalid_response");
    return rows.length ? validateRow(rows[0]) : null;
  }
  return {
    async load() {
      config(env);
      let row = await readRow();
      if (row) { loadedVersion = row.version; return row.state; }
      if (env.VERCEL_ENV !== "preview" || env.ZOZ_PRO_SUPABASE_ALLOW_EMPTY_PREVIEW_INIT !== "true") {
        throw new SupabaseStateStoreError("Supabase state is not initialized. No Blob data was migrated and production was not seeded.", "supabase_state_not_initialized");
      }
      const initial = createInitialState();
      const inserted = await request("zoz_pro_state?on_conflict=singleton", {
        method: "POST", body: { singleton: true, version: 1, state: initial },
        prefer: "resolution=ignore-duplicates,return=representation",
      });
      row = Array.isArray(inserted) && inserted.length ? validateRow(inserted[0]) : await readRow();
      if (!row) throw new SupabaseStateStoreError("Preview initialization did not produce a durable row.", "supabase_state_not_initialized");
      loadedVersion = row.version; return row.state;
    },
    async save(state) {
      validateState(state);
      if (loadedVersion === null) throw new SupabaseStateStoreError("Load state before saving.", "supabase_state_version_missing");
      const expected = loadedVersion, next = (BigInt(expected) + 1n).toString();
      const rows = await request("zoz_pro_state?singleton=eq.true&version=eq." + encodeURIComponent(expected), {
        method: "PATCH", body: { state, version: next, updated_at: new Date().toISOString() }, prefer: "return=representation",
      });
      if (!Array.isArray(rows) || rows.length !== 1) {
        console.warn("ZOZ Pro Supabase optimistic state conflict", { backend: "supabase", expectedVersionPresent: true, updatedRows: Array.isArray(rows) ? rows.length : null });
        throw new StateWriteConflictError("Supabase state changed since load; retry the mutation against the latest version.");
      }
      loadedVersion = String(rows[0].version ?? next);
    },
  };
}
