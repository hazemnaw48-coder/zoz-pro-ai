import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const OWNER_EMAIL = "hazemnaw48@gmail.com";
const SELF = SUPABASE_URL + "/functions/v1/zoz-pro-youtube-analytics";
const CHANNEL_ID = "UCIael48cvwPG3gKj--c7HKw";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
function fail(error: string, status = 400) { return json({ ok: false, error }, status); }
function dbHeaders() {
  const h: Record<string, string> = { apikey: SERVICE_KEY, "content-type": "application/json" };
  if (!SERVICE_KEY.startsWith("sb_secret_")) h.authorization = "Bearer " + SERVICE_KEY;
  return h;
}
async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, { ...init, headers: { ...dbHeaders(), ...(init.headers as Record<string, string> || {}) } });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error("Private database request failed (" + r.status + ").");
  return d;
}
async function owner(req: Request) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ") || !PUBLISHABLE_KEY) return null;
  const r = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: PUBLISHABLE_KEY, authorization: auth } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => ({}));
  return String(u.email || "").toLowerCase() === OWNER_EMAIL && u.email_confirmed_at ? u : null;
}
async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
function validDate(s: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + "T00:00:00Z"); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; }

async function connect(u: any) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return fail("Google OAuth client secrets are not configured in this Supabase project.", 503);
  const state = crypto.randomUUID() + "-" + crypto.randomUUID();
  await db("zoz_pro_youtube_oauth_states", {
    method: "POST",
    headers: { prefer: "return=minimal" },
    body: JSON.stringify({ state_hash: await sha(state), owner_id: u.id, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() }),
  });
  const p = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: SELF,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return json({ ok: true, authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString(), redirect_uri: SELF, channel_id_expected: CHANNEL_ID, scopes: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"] });
}
async function callback(url: URL) {
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const error = url.searchParams.get("error") || "";
  if (!state) return fail("OAuth state is missing.", 400);
  const rows = await db("zoz_pro_youtube_oauth_states?state_hash=eq." + await sha(state) + "&consumed_at=is.null&expires_at=gt." + encodeURIComponent(new Date().toISOString()) + "&select=*&limit=1");
  const st = rows?.[0];
  if (!st) return fail("OAuth state expired or invalid. Return to ZOZ Pro and reconnect.", 400);
  await db("zoz_pro_youtube_oauth_states?state_hash=eq." + st.state_hash, { method: "PATCH", headers: { prefer: "return=minimal" }, body: JSON.stringify({ consumed_at: new Date().toISOString() }) });
  if (error || !code) return fail("Google authorization was cancelled or denied.", 400);
  const tr = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: SELF, grant_type: "authorization_code" }),
  });
  const token = await tr.json().catch(() => ({}));
  if (!tr.ok || !token.access_token) return fail("Google token exchange failed (" + tr.status + "). Check OAuth redirect URI configuration.", 502);
  const ch = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&id=" + encodeURIComponent(CHANNEL_ID), { headers: { authorization: "Bearer " + token.access_token } });
  const channel = await ch.json().catch(() => ({}));
  if (!ch.ok || !channel.items?.some((x: any) => x.id === CHANNEL_ID)) return fail("The authorized Google account did not return the required Hazem Ahmed channel. No channel token was saved.", 403);
  const scopeList = String(token.scope || "").split(" ").filter(Boolean);
  const needed = ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"];
  if (!needed.every(s => scopeList.includes(s))) return fail("Google did not grant both required read-only scopes. No channel token was saved.", 403);
  await db("zoz_pro_youtube_analytics_tokens?on_conflict=channel_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      channel_id: CHANNEL_ID,
      owner_id: st.owner_id,
      access_token: token.access_token,
      refresh_token: token.refresh_token || null,
      token_expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
      scopes: scopeList,
      status: "active",
      updated_at: new Date().toISOString(),
    }),
  });
  return new Response("<!doctype html><meta charset=utf-8><title>ZOZ Pro</title><main style='font:18px system-ui;max-width:600px;margin:10vh auto;padding:24px'><h2>YouTube read-only authorization complete</h2><p>Return to ZOZ Pro. No video or channel data was changed.</p></main>", { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
async function report(req: Request) {
  const u = await owner(req);
  if (!u) return fail("Owner authentication required.", 401);
  const body = await req.json().catch(() => ({}));
  const start = String(body.start_date || "");
  const end = String(body.end_date || "");
  const channelId = String(body.channel_id || CHANNEL_ID);
  if (channelId !== CHANNEL_ID) return fail("This endpoint is restricted to the configured Hazem Ahmed channel.", 403);
  if (!validDate(start) || !validDate(end) || start > end || end > new Date().toISOString().slice(0, 10)) return fail("Provide valid start_date and end_date; end_date cannot be in the future.", 400);
  const rows = await db("zoz_pro_youtube_analytics_tokens?channel_id=eq." + encodeURIComponent(CHANNEL_ID) + "&owner_id=eq." + encodeURIComponent(u.id) + "&status=eq.active&select=access_token,token_expires_at,scopes&limit=1");
  const saved = rows?.[0];
  if (!saved) return fail("ZOZ Pro has no independent OAuth authorization for this channel. Connect YouTube first.", 409);
  if (Date.parse(saved.token_expires_at) < Date.now() + 60000) return fail("Access token is expired or near expiry. Reconnect through the official Google consent flow; this read endpoint does not refresh or write tokens.", 409);
  if (!saved.scopes?.includes("https://www.googleapis.com/auth/yt-analytics.readonly")) return fail("The saved authorization lacks YouTube Analytics read-only scope.", 403);
  const access = saved.access_token;
  const base = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  const query = async (metrics: string, dimensions: string) => {
    const p = new URLSearchParams({ ids: "channel==MINE", startDate: start, endDate: end, metrics, dimensions, sort: dimensions === "day" ? "day" : "day,insightTrafficSourceType" });
    const r = await fetch(base.toString() + "?" + p.toString(), { headers: { authorization: "Bearer " + access } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error("YouTube Analytics API returned HTTP " + r.status + ".");
    return data;
  };
  try {
    const [daily, traffic] = await Promise.all([
      query("views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost", "day"),
      query("views", "day,insightTrafficSourceType"),
    ]);
    const rows = daily.rows || [];
    const totals = rows.reduce((a: any, r: any[]) => {
      a.views += Number(r[1] || 0);
      a.watch_time_minutes += Number(r[2] || 0);
      a.subscribers_gained += Number(r[4] || 0);
      a.subscribers_lost += Number(r[5] || 0);
      return a;
    }, { views: 0, watch_time_minutes: 0, subscribers_gained: 0, subscribers_lost: 0 });
    const avgSeconds = rows.length ? rows.reduce((s: number, r: any[]) => s + Number(r[3] || 0) * Number(r[1] || 0), 0) / Math.max(1, totals.views) : 0;
    return json({
      ok: true,
      source: "youtube-analytics-api",
      channel_id: CHANNEL_ID,
      start_date: start,
      end_date: end,
      metrics: { ...totals, watch_time_hours: totals.watch_time_minutes / 60, average_view_duration_seconds_weighted: avgSeconds, subscribers_net: totals.subscribers_gained - totals.subscribers_lost },
      daily: rows.map((r: any[]) => ({ date: r[0], views: r[1], estimated_minutes_watched: r[2], average_view_duration_seconds: r[3], subscribers_gained: r[4], subscribers_lost: r[5] })),
      traffic_sources_daily: (traffic.rows || []).map((r: any[]) => ({ date: r[0], source: r[1], views: r[2] })),
      missing_dates: [],
      note: "A date absent from daily rows means the API returned no row for that date; no values are synthesized. This endpoint does not write analytics snapshots or refresh tokens.",
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "YouTube Analytics request failed.", 502);
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  const url = new URL(req.url);
  if (req.method === "GET" && (url.searchParams.has("code") || url.searchParams.has("state") || url.searchParams.has("error"))) return await callback(url);
  if (req.method !== "POST") return fail("Use POST. OAuth callback is handled by GET.", 405);
  const u = await owner(req);
  if (!u) return fail("Owner authentication required.", 401);
  if (url.searchParams.get("action") === "connect") return await connect(u);
  if (url.searchParams.get("action") === "analytics") return await report(req);
  return fail("Unknown action. Use ?action=connect or ?action=analytics.", 404);
});
