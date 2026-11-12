import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const OWNER_EMAIL = "hazemnaw48@gmail.com";
const API_BASE = "https://business-api.tiktok.com/open_api/v1.3";


const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers });
const clean = (v: unknown, max = 1000) =>
  String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim().slice(0, max);
const html = (message: string, status = 200) =>
  new Response(`<!doctype html><html lang="ar"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ZOZ Pro · TikTok Ads</title><body style="font-family:system-ui;max-width:620px;margin:48px auto;padding:20px;line-height:1.7"><h2>ZOZ Pro · TikTok Ads</h2><p>${message}</p><p>يمكنك العودة إلى مركز ZOZ Pro.</p></body></html>`, {
    status, headers: { ...headers, "content-type": "text/html; charset=utf-8" },
  });

function dbHeaders() {
  return { apikey: SERVICE, authorization: "Bearer " + SERVICE, "content-type": "application/json" };
}
async function db(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE) throw new Error("supabase_server_configuration_missing");
  const response = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...init, headers: { ...dbHeaders(), ...((init.headers || {}) as Record<string, string>) },
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error("database_request_failed_" + response.status + ":" + raw.slice(0, 220));
  return raw ? JSON.parse(raw) : null;
}
async function owner(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(auth) || !ANON) return null;
  const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
    headers: { apikey: ANON, authorization: auth }, signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return user?.id && user?.email_confirmed_at && clean(user?.email, 254).toLowerCase() === OWNER_EMAIL ? user : null;
}
async function digest(value: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function vaultSet(name: string, value: string) {
  await db("rpc/zoz_tiktok_ads_vault_set", {
    method: "POST", body: JSON.stringify({ p_secret_name: name, p_secret_value: value }),
  });
}
async function vaultGet(name: string): Promise<string> {
  const value = await db("rpc/zoz_tiktok_ads_vault_get", {
    method: "POST", body: JSON.stringify({ p_secret_name: name }),
  });
  return typeof value === "string" ? value : "";
}
async function markMarketingToolConnected(ownerId: string, advertiserIds: string[]) {
  const tools = await db("zoz_pro_tool_catalog?tool_key=eq.tiktok_marketing_api&select=id&limit=1");
  const toolId = tools?.[0]?.id;
  if (!toolId) return;
  const now = new Date().toISOString();
  const existing = await db("zoz_pro_tool_connections?owner_id=eq." + encodeURIComponent(ownerId) + "&tool_id=eq." + encodeURIComponent(toolId) + "&select=id&limit=1");
  const payload = {
    owner_id: ownerId, tool_id: toolId, connection_status: "connected",
    connection_method: "supabase_edge_function_oauth",
    account_label: "TikTok Ads · " + advertiserIds.length + " authorized advertiser(s)",
    capabilities_enabled: ["advertiser_account_read", "campaign_read", "report_read"],
    last_checked_at: now, last_error: null,
    setup_notes: "TikTok Marketing API advertiser OAuth verified. Read-only advertiser, campaign, and integrated report actions are available. Campaign activation and budget changes remain disabled."
  };
  if (existing?.[0]?.id) {
    await db("zoz_pro_tool_connections?id=eq." + encodeURIComponent(existing[0].id), {
      method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify(payload),
    });
  } else {
    await db("zoz_pro_tool_connections", {
      method: "POST", headers: { prefer: "return=minimal" }, body: JSON.stringify(payload),
    });
  }
  await db("zoz_pro_tool_catalog?id=eq." + encodeURIComponent(toolId), {
    method: "PATCH", headers: { prefer: "return=minimal" },
    body: JSON.stringify({ integration_status: "connected" }),
  });
}
async function audit(ownerId: string, action: string, result: string, advertiserId: string | null = null, details: unknown = {}) {
  await db("zoz_tiktok_ads_audit", {
    method: "POST", headers: { prefer: "return=minimal" },
    body: JSON.stringify({ owner_id: ownerId, actor: "zoz_tiktok_ads_edge_function", action, advertiser_id: advertiserId, result, details }),
  }).catch(() => null);
}
async function appCredentials() {
  const appId = await vaultGet("zoz_tiktok_ads_app_id");
  const appSecret = await vaultGet("zoz_tiktok_ads_app_secret");
  const authorizationUrl = await vaultGet("zoz_tiktok_ads_authorization_url");
  if (!appId || !appSecret || !authorizationUrl) throw new Error("tiktok_developer_app_setup_incomplete");
  let parsed: URL;
  try { parsed = new URL(authorizationUrl); } catch { throw new Error("tiktok_advertiser_authorization_url_invalid"); }
  if (parsed.protocol !== "https:" || !["business-api.tiktok.com", "ads.tiktok.com"].includes(parsed.hostname) || !parsed.pathname.includes("/portal/auth")) {
    throw new Error("tiktok_advertiser_authorization_url_invalid");
  }
  return { appId, appSecret, authorizationUrl: parsed.toString() };
}
async function tiktok(path: string, accessToken: string, params: Record<string, string> = {}) {
  const url = new URL(API_BASE + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: { "Access-Token": accessToken, "content-type": "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || (typeof data?.code === "number" && data.code !== 0)) {
    throw new Error("tiktok_api_error_" + response.status + ":" + clean(data?.message || data?.error?.message, 240));
  }
  return data;
}
function tokenSecretName(advertiserId: string) {
  return "zoz_tiktok_ads_token_" + advertiserId.replace(/[^a-zA-Z0-9]/g, "").toLowerCase().padStart(5, "0").slice(0, 80);
}
async function callback(req: Request) {
  const url = new URL(req.url);
  const state = clean(url.searchParams.get("state"), 180);
  const authCode = clean(url.searchParams.get("auth_code") || url.searchParams.get("code"), 2000);
  const providerError = clean(url.searchParams.get("error_description") || url.searchParams.get("error"), 300);
  if (providerError) return html("لم يكتمل تفويض TikTok. ارجع إلى مركز ZOZ Pro وراجع إعدادات تطبيق المطور، ثم أعد المحاولة.", 400);
  if (!state || !authCode) return html("بيانات عودة TikTok غير مكتملة.", 400);
  const stateHash = await digest(state);
  const rows = await db("zoz_tiktok_ads_oauth_states?state_hash=eq." + encodeURIComponent(stateHash) + "&consumed_at=is.null&expires_at=gt." + encodeURIComponent(new Date().toISOString()) + "&select=id,owner_id&limit=1");
  const pending = rows?.[0];
  if (!pending) return html("رابط التفويض منتهي أو مستخدم بالفعل. ابدأ الربط من مركز ZOZ Pro مرة أخرى.", 410);
  const consumed = await db("zoz_tiktok_ads_oauth_states?id=eq." + encodeURIComponent(pending.id) + "&consumed_at=is.null", {
    method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ consumed_at: new Date().toISOString() }),
  });
  if (!Array.isArray(consumed) || consumed.length !== 1) return html("تم استخدام حالة التفويض بالفعل.", 409);
  const { appId, appSecret } = await appCredentials();
  const tokenResponse = await fetch(API_BASE + "/oauth2/access_token/", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: appId, secret: appSecret, auth_code: authCode, grant_type: "auth_code" }),
    signal: AbortSignal.timeout(20000),
  });
  const tokenData = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || tokenData?.code !== 0) {
    await audit(pending.owner_id, "oauth_exchange", "failed", null, { http_status: tokenResponse.status, provider_code: tokenData?.code ?? null });
    return html("تعذر تبادل رمز التفويض مع TikTok. راجع إعدادات التطبيق وعنوان العودة، ثم أعد المحاولة.", 502);
  }
  const data = tokenData?.data || {};
  const accessToken = clean(data.access_token, 6000);
  const refreshToken = clean(data.refresh_token, 6000);
  let advertiserIds = Array.isArray(data.advertiser_ids) ? data.advertiser_ids.map((x: unknown) => clean(x, 80)).filter(Boolean) : [];
  if (advertiserIds.length === 0) {
    try {
      const authorized = await fetch(API_BASE + "/oauth2/advertiser/get/?app_id=" + encodeURIComponent(appId) + "&secret=" + encodeURIComponent(appSecret) + "&access_token=" + encodeURIComponent(accessToken), { signal: AbortSignal.timeout(20000) });
      const authorizedData = await authorized.json().catch(() => ({}));
      if (authorized.ok && authorizedData?.code === 0) advertiserIds = (authorizedData?.data?.list || authorizedData?.data?.advertiser_ids || []).map((x: any) => clean(typeof x === "object" ? x.advertiser_id : x, 80)).filter(Boolean);
    } catch { /* the user can reauthorize after the provider grants advertiser access */ }
  }
  if (!accessToken || advertiserIds.length === 0) return html("تمت العودة من TikTok لكن لم تُمنح صلاحية لأي حساب إعلاني.", 422);
  let saved = 0;
  for (const advertiserId of advertiserIds.slice(0, 50)) {
    const secretName = tokenSecretName(advertiserId);
    await vaultSet(secretName, JSON.stringify({
      access_token: accessToken, refresh_token: refreshToken,
      access_token_expires_in: Number(data.access_token_expire_in || data.access_token_expires_in || 0),
      refresh_token_expires_in: Number(data.refresh_token_expire_in || data.refresh_token_expires_in || 0),
      stored_at: new Date().toISOString(),
    }));
    let snapshot: any = {};
    try {
      const info = await tiktok("/advertiser/info/", accessToken, { advertiser_ids: JSON.stringify([advertiserId]) });
      snapshot = Array.isArray(info?.data?.list) ? (info.data.list[0] || {}) : {};
    } catch {
      snapshot = { advertiser_id: advertiserId, info_pending: true };
    }
    await db("zoz_tiktok_ads_connections?on_conflict=owner_id,advertiser_id", {
      method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        owner_id: pending.owner_id, advertiser_id: advertiserId,
        advertiser_name: clean(snapshot?.advertiser_name, 200) || null,
        business_center_id: clean(snapshot?.bc_id, 100) || null,
        currency: clean(snapshot?.currency, 12) || null,
        timezone: clean(snapshot?.timezone, 80) || null,
        account_status: "authorized", token_secret_name: secretName,
        scopes: Array.isArray(data.scope) ? data.scope : clean(data.scope, 1000).split(/[ ,]+/).filter(Boolean),
        account_snapshot: snapshot, last_verified_at: new Date().toISOString(),
        last_error: null, updated_at: new Date().toISOString(),
      }),
    });
    saved++;
  }
  if (saved > 0) await markMarketingToolConnected(pending.owner_id, advertiserIds.slice(0, 50));
  await audit(pending.owner_id, "oauth_exchange", "succeeded", null, { advertisers_saved: saved });
  return html("تم ربط TikTok Ads بنجاح. أُضيفت " + saved + " حسابات إعلانية إلى مركز ZOZ Pro. لن يتم إنشاء حملات أو إنفاق أموال دون موافقتك.");
}
async function saveAppCredentials(req: Request) {
  const user = await owner(req);
  if (!user) return json({ ok: false, error: "owner_auth_required" }, 401);
  const body = await req.json().catch(() => ({}));
  const appId = clean(body?.app_id, 180);
  const appSecret = clean(body?.app_secret, 4000);
  const authorizationUrl = clean(body?.authorization_url, 4000);
  if (appId.length < 5 || appSecret.length < 12 || !authorizationUrl) {
    return json({ ok: false, error: "app_id_secret_and_authorization_url_required" }, 400);
  }
  let parsed: URL;
  try { parsed = new URL(authorizationUrl); } catch { return json({ ok: false, error: "tiktok_advertiser_authorization_url_invalid" }, 400); }
  if (parsed.protocol !== "https:" || !["business-api.tiktok.com", "ads.tiktok.com"].includes(parsed.hostname) || !parsed.pathname.includes("/portal/auth")) {
    return json({ ok: false, error: "tiktok_advertiser_authorization_url_invalid" }, 400);
  }
  await vaultSet("zoz_tiktok_ads_app_id", appId);
  await vaultSet("zoz_tiktok_ads_app_secret", appSecret);
  await vaultSet("zoz_tiktok_ads_authorization_url", parsed.toString());
  await audit(user.id, "save_developer_app_credentials", "succeeded");
  return json({ ok: true, saved: true, secret_stored: true, callback_url: SUPABASE_URL + "/functions/v1/zoz-tiktok-ads" });
}
async function start(req: Request) {
  const user = await owner(req);
  if (!user) return json({ ok: false, error: "owner_auth_required" }, 401);
  const { authorizationUrl } = await appCredentials();
  const state = randomState();
  await db("zoz_tiktok_ads_oauth_states", {
    method: "POST", headers: { prefer: "return=minimal" },
    body: JSON.stringify({ owner_id: user.id, state_hash: await digest(state), expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() }),
  });
  const authorization = new URL(authorizationUrl);
  authorization.searchParams.set("state", state);
  const callbackUrl = SUPABASE_URL + "/functions/v1/zoz-tiktok-ads";
  await audit(user.id, "oauth_start", "created");
  return json({ ok: true, authorization_url: authorization.toString(), callback_url: callbackUrl, expires_in_seconds: 900, note: "Add callback_url exactly to the TikTok developer app before authorization." });
}
async function status(req: Request) {
  const user = await owner(req);
  if (!user) return json({ ok: false, error: "owner_auth_required" }, 401);
  const rows = await db("zoz_tiktok_ads_connections?owner_id=eq." + encodeURIComponent(user.id) + "&select=advertiser_id,advertiser_name,business_center_id,currency,timezone,account_status,scopes,account_snapshot,last_verified_at,last_synced_at,last_error&order=created_at.desc");
  return json({ ok: true, connected: rows?.length > 0, advertisers: rows || [] });
}
async function report(req: Request) {
  const user = await owner(req);
  if (!user) return json({ ok: false, error: "owner_auth_required" }, 401);
  const body = await req.json().catch(() => ({}));
  const advertiserId = clean(body?.advertiser_id, 80);
  const startDate = clean(body?.start_date, 10);
  const endDate = clean(body?.end_date, 10);
  if (!advertiserId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
    return json({ ok: false, error: "valid_advertiser_and_date_range_required" }, 400);
  }
  const rows = await db("zoz_tiktok_ads_connections?owner_id=eq." + encodeURIComponent(user.id) + "&advertiser_id=eq." + encodeURIComponent(advertiserId) + "&select=advertiser_id,token_secret_name&limit=1");
  const connection = rows?.[0];
  if (!connection) return json({ ok: false, error: "advertiser_not_connected" }, 404);
  const tokenValue = await vaultGet(connection.token_secret_name);
  let stored: any = {};
  try { stored = JSON.parse(tokenValue); } catch { return json({ ok: false, error: "stored_token_invalid" }, 500); }
  const accessToken = clean(stored.access_token, 6000);
  const params = {
    report_type: "BASIC",
    advertiser_id: advertiserId,
    data_level: "AUCTION_ADVERTISER",
    dimensions: JSON.stringify(["stat_time_day"]),
    metrics: JSON.stringify(["spend", "impressions", "clicks", "ctr", "cpc", "cpm", "conversion"]),
    start_date: startDate,
    end_date: endDate,
    page: "1",
    page_size: "100",
  };
  const result = await tiktok("/report/integrated/get/", accessToken, params);
  await audit(user.id, "read_integrated_advertiser_report", "succeeded", advertiserId, { start_date: startDate, end_date: endDate });
  return json({ ok: true, advertiser_id: advertiserId, start_date: startDate, end_date: endDate, report: result?.data || {}, actions_performed: ["read_integrated_advertiser_report"] });
}
async function sync(req: Request) {
  const user = await owner(req);
  if (!user) return json({ ok: false, error: "owner_auth_required" }, 401);
  const body = await req.json().catch(() => ({}));
  const advertiserId = clean(body?.advertiser_id, 80);
  if (!advertiserId) return json({ ok: false, error: "advertiser_id_required" }, 400);
  const rows = await db("zoz_tiktok_ads_connections?owner_id=eq." + encodeURIComponent(user.id) + "&advertiser_id=eq." + encodeURIComponent(advertiserId) + "&select=advertiser_id,token_secret_name&limit=1");
  const connection = rows?.[0];
  if (!connection) return json({ ok: false, error: "advertiser_not_connected" }, 404);
  const tokenValue = await vaultGet(connection.token_secret_name);
  let stored: any = {};
  try { stored = JSON.parse(tokenValue); } catch { return json({ ok: false, error: "stored_token_invalid" }, 500); }
  const accessToken = clean(stored.access_token, 6000);
  const [info, campaigns] = await Promise.all([
    tiktok("/advertiser/info/", accessToken, { advertiser_ids: JSON.stringify([advertiserId]) }),
    tiktok("/campaign/get/", accessToken, { advertiser_id: advertiserId, page: "1", page_size: "50" }),
  ]);
  const snapshot = Array.isArray(info?.data?.list) ? (info.data.list[0] || {}) : {};
  const campaignList = Array.isArray(campaigns?.data?.list) ? campaigns.data.list : [];
  const now = new Date().toISOString();
  await db("zoz_tiktok_ads_connections?owner_id=eq." + encodeURIComponent(user.id) + "&advertiser_id=eq." + encodeURIComponent(advertiserId), {
    method: "PATCH", headers: { prefer: "return=minimal" },
    body: JSON.stringify({ advertiser_name: clean(snapshot?.advertiser_name, 200) || null, currency: clean(snapshot?.currency, 12) || null, timezone: clean(snapshot?.timezone, 80) || null, account_snapshot: { ...snapshot, campaigns_preview: campaignList.slice(0, 20) }, last_verified_at: now, last_synced_at: now, last_error: null, updated_at: now }),
  });
  await audit(user.id, "read_advertiser_and_campaigns", "succeeded", advertiserId, { campaign_count: campaignList.length });
  return json({ ok: true, advertiser: snapshot, campaigns: campaignList, synced_at: now, actions_performed: ["read_advertiser_info", "read_campaign_list"] });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && (url.searchParams.has("auth_code") || url.searchParams.has("code") || url.searchParams.has("error"))) {
      return await callback(req);
    }
    if (req.method === "GET" && url.searchParams.get("health") === "1") {
      return json({ ok: true, service: "zoz-tiktok-ads", version: 1, callback_path: "/functions/v1/zoz-tiktok-ads" });
    }
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    const body = await req.clone().json().catch(() => ({}));
    switch (clean(body?.action, 40)) {
      case "save_app_credentials": return await saveAppCredentials(req);
      case "connect_start": return await start(req);
      case "status": return await status(req);
      case "sync": return await sync(req);
      case "report": return await report(req);
      default: return json({ ok: false, error: "unsupported_action" }, 400);
    }
  } catch (error) {
    const message = clean(error instanceof Error ? error.message : error, 300);
    const status = message.startsWith("tiktok_developer_app_") || message === "tiktok_advertiser_authorization_url_invalid" ? 503 : 500;
    return json({ ok: false, error: message }, status);
  }
});
