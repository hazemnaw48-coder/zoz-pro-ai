import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const digest = async (value: string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
const randomToken = (n = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return json({ error: "server_not_configured" }, 503);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const body = await req.json();
    const action = String(body.action || "");

    const authHeader = req.headers.get("Authorization") || "";
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const { data: authData } = bearer ? await userClient.auth.getUser() : { data: { user: null } };
    const user = authData?.user ?? null;

    const audit = async (owner_id: string, app_id: string | null, event_type: string, details: unknown, command_id: string | null = null, actor_type = "owner") => {
      await admin.from("zoz_pro_managed_app_audit").insert({
        owner_id, app_id, command_id, actor_type, actor_ref: user?.id ?? "app_worker",
        event_type, details: details ?? {},
      });
    };
    const ownedApp = async (appId: string) => {
      if (!user) return { error: "unauthorized" as const };
      const { data, error } = await admin.from("zoz_pro_managed_apps").select("*").eq("id", appId).eq("owner_id", user.id).maybeSingle();
      if (error || !data) return { error: "app_not_found_or_forbidden" as const };
      return { app: data };
    };

    if (action === "worker_claim" || action === "worker_complete") {
      const workerToken = String(body.worker_token || "");
      if (workerToken.length < 32) return json({ error: "invalid_worker_token" }, 401);
      const tokenHash = await digest(workerToken);
      const { data: tokenRow } = await admin.from("zoz_pro_managed_app_worker_tokens")
        .select("id,owner_id,app_id,expires_at,revoked_at")
        .eq("token_hash", tokenHash).is("revoked_at", null).maybeSingle();
      if (!tokenRow || (tokenRow.expires_at && new Date(tokenRow.expires_at).getTime() <= Date.now())) {
        return json({ error: "invalid_worker_token" }, 401);
      }
      await admin.from("zoz_pro_managed_app_worker_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tokenRow.id);

      if (action === "worker_claim") {
        const { data: commands } = await admin.from("zoz_pro_managed_app_commands")
          .select("id,capability_key,payload,attempts,max_attempts,expires_at")
          .eq("app_id", tokenRow.app_id).eq("status", "queued")
          .lte("scheduled_at", new Date().toISOString()).order("priority", { ascending: true })
          .order("created_at", { ascending: true }).limit(1);
        const command = commands?.[0];
        if (!command) return json({ command: null });
        if (command.expires_at && new Date(command.expires_at).getTime() <= Date.now()) {
          await admin.from("zoz_pro_managed_app_commands").update({ status: "expired", completed_at: new Date().toISOString() }).eq("id", command.id);
          return json({ command: null });
        }
        const lease = randomToken(24);
        const { data: claimed, error } = await admin.from("zoz_pro_managed_app_commands").update({
          status: "running", attempts: command.attempts + 1, started_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 90_000).toISOString(),
          lease_token_hash: await digest(lease), updated_at: new Date().toISOString(),
        }).eq("id", command.id).eq("status", "queued").select("id").maybeSingle();
        if (error || !claimed) return json({ command: null });
        await audit(tokenRow.owner_id, tokenRow.app_id, "command.claimed", { capability_key: command.capability_key }, command.id, "app_worker");
        return json({ command: { id: command.id, capability_key: command.capability_key, payload: command.payload, lease_token: lease } });
      }

      const commandId = String(body.command_id || "");
      const leaseToken = String(body.lease_token || "");
      const status = body.status === "succeeded" ? "succeeded" : "failed";
      const { data: command } = await admin.from("zoz_pro_managed_app_commands").select("id,owner_id,app_id,lease_token_hash,status")
        .eq("id", commandId).eq("app_id", tokenRow.app_id).eq("status", "running").maybeSingle();
      if (!command || !command.lease_token_hash || !safeEqual(command.lease_token_hash, await digest(leaseToken))) {
        return json({ error: "invalid_command_lease" }, 409);
      }
      const { error } = await admin.from("zoz_pro_managed_app_commands").update({
        status, result: body.result ?? {}, error_code: body.error_code ?? null,
        error_message: body.error_message ?? null, completed_at: new Date().toISOString(),
        lease_token_hash: null, lease_expires_at: null, updated_at: new Date().toISOString(),
      }).eq("id", commandId);
      if (error) return json({ error: "command_update_failed" }, 500);
      await audit(command.owner_id, command.app_id, "command." + status, { error_code: body.error_code ?? null }, commandId, "app_worker");
      return json({ ok: true });
    }

    if (!user) return json({ error: "unauthorized" }, 401);

    if (action === "register_app") {
      const appKey = String(body.app_key || "").toLowerCase();
      const displayName = String(body.display_name || "").trim();
      const platform = String(body.platform || "web");
      if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(appKey) || displayName.length < 2 || displayName.length > 120 ||
        !["android","web","ios","desktop","multi"].includes(platform)) return json({ error: "invalid_app_manifest" }, 400);
      const { data: app, error } = await admin.from("zoz_pro_managed_apps").insert({
        owner_id: user.id, app_key: appKey, display_name: displayName, platform,
        package_name: body.package_name ?? null, base_url: body.base_url ?? null,
        adapter_key: body.adapter_key ?? appKey, lifecycle_status: body.lifecycle_status ?? "development",
        autonomy_mode: "guarded", metadata: body.metadata ?? {},
      }).select("*").single();
      if (error) return json({ error: "app_registration_failed", detail: error.message }, 400);
      const caps = Array.isArray(body.capabilities) ? body.capabilities : [];
      for (const cap of caps) {
        const key = String(cap.capability_key || "");
        const risk = ["read_only","internal_write","external_action","financial","destructive"].includes(cap.risk_level) ? cap.risk_level : "read_only";
        if (!/^[a-z][a-z0-9_.-]{1,99}$/.test(key)) continue;
        await admin.from("zoz_pro_managed_app_capabilities").insert({
          owner_id: user.id, app_id: app.id, capability_key: key,
          display_name: String(cap.display_name || key).slice(0,120),
          description: String(cap.description || "").slice(0,1000), risk_level: risk,
          approval_required: risk !== "read_only" || cap.approval_required === true,
          input_schema: cap.input_schema ?? {}, constraints_json: cap.constraints ?? {},
        });
      }
      await audit(user.id, app.id, "app.registered", { app_key: appKey, capability_count: caps.length });
      return json({ app });
    }

    const appId = String(body.app_id || "");
    const owned = await ownedApp(appId);
    if (owned.error) return json({ error: owned.error }, 404);
    const app = owned.app;

    if (action === "list") {
      const [caps, commands] = await Promise.all([
        admin.from("zoz_pro_managed_app_capabilities").select("*").eq("app_id", appId).order("capability_key"),
        admin.from("zoz_pro_managed_app_commands").select("id,capability_key,status,approval_status,created_at,updated_at,result,error_code").eq("app_id", appId).order("created_at", { ascending: false }).limit(100),
      ]);
      return json({ app, capabilities: caps.data ?? [], commands: commands.data ?? [] });
    }

    if (action === "create_worker_token") {
      const token = "zozapp_" + randomToken(36);
      const { error } = await admin.from("zoz_pro_managed_app_worker_tokens").insert({
        owner_id: user.id, app_id: appId, token_hash: await digest(token),
        label: String(body.label || "default worker").slice(0,80),
      });
      if (error) return json({ error: "worker_token_creation_failed" }, 500);
      await audit(user.id, appId, "worker_token.created", { label: body.label || "default worker" });
      return json({ worker_token: token, warning: "Store this token securely. It is shown only once." });
    }

    if (action === "enqueue") {
      const capabilityKey = String(body.capability_key || "");
      const { data: cap } = await admin.from("zoz_pro_managed_app_capabilities").select("*")
        .eq("app_id", appId).eq("owner_id", user.id).eq("capability_key", capabilityKey).eq("enabled", true).maybeSingle();
      if (!cap) return json({ error: "capability_not_available" }, 404);
      const highRisk = ["external_action","financial","destructive"].includes(cap.risk_level);
      const needsApproval = cap.approval_required || highRisk;
      const idempotency = String(body.idempotency_key || crypto.randomUUID()).slice(0,120);
      const { data: command, error } = await admin.from("zoz_pro_managed_app_commands").insert({
        owner_id: user.id, app_id: appId, capability_id: cap.id, capability_key: capabilityKey,
        payload: body.payload ?? {}, status: needsApproval ? "awaiting_approval" : "queued",
        approval_required: needsApproval, approval_status: needsApproval ? "pending" : "not_required",
        requested_by: user.id, idempotency_key: idempotency,
        priority: Number.isInteger(body.priority) ? Math.max(0,Math.min(100,body.priority)) : 50,
        expires_at: body.expires_at ?? null,
      }).select("*").single();
      if (error) return json({ error: "command_enqueue_failed", detail: error.message }, 400);
      await audit(user.id, appId, "command.enqueued", { capability_key: capabilityKey, status: command.status }, command.id);
      return json({ command });
    }

    if (action === "approve") {
      const commandId = String(body.command_id || "");
      const { data: command } = await admin.from("zoz_pro_managed_app_commands").select("*")
        .eq("id", commandId).eq("app_id", appId).eq("owner_id", user.id).eq("status", "awaiting_approval").maybeSingle();
      if (!command) return json({ error: "command_not_awaiting_approval" }, 404);
      const { error } = await admin.from("zoz_pro_managed_app_commands").update({
        status: "queued", approval_status: "approved", approved_by: user.id,
        approved_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", commandId);
      if (error) return json({ error: "approval_failed" }, 500);
      await audit(user.id, appId, "command.approved", { capability_key: command.capability_key }, commandId);
      return json({ ok: true, command_id: commandId });
    }

    if (action === "set_autonomy") {
      const mode = String(body.autonomy_mode || "");
      if (!["manual","guarded","routine_autonomy"].includes(mode)) return json({ error: "invalid_autonomy_mode" }, 400);
      const { error } = await admin.from("zoz_pro_managed_apps").update({ autonomy_mode: mode, updated_at: new Date().toISOString() })
        .eq("id", appId).eq("owner_id", user.id);
      if (error) return json({ error: "autonomy_update_failed" }, 500);
      await audit(user.id, appId, "app.autonomy_changed", { autonomy_mode: mode });
      return json({ ok: true, autonomy_mode: mode });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (error) {
    return json({ error: "internal_error", detail: error instanceof Error ? error.message : "unknown" }, 500);
  }
});
