import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
function defaultKey(envName: string): string {
  try {
    const parsed = JSON.parse(Deno.env.get(envName) || "{}");
    return typeof parsed?.default === "string" ? parsed.default : "";
  } catch {
    return "";
  }
}
const SERVICE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  defaultKey("SUPABASE_SECRET_KEYS") ||
  Deno.env.get("SUPABASE_SECRET_KEY") ||
  "";
const PUBLISHABLE_KEY =
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ||
  defaultKey("SUPABASE_PUBLISHABLE_KEYS") ||
  Deno.env.get("SUPABASE_ANON_KEY") ||
  "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const OWNER_EMAIL = "hazemnaw48@gmail.com";
const SELF = SUPABASE_URL + "/functions/v1/zoz-pro-youtube-analytics";
const CALLBACK_URL = SUPABASE_URL + "/functions/v1/zoz-pro-youtube-oauth-callback";
const CHANNEL_ID = "UCIael48cvwPG3gKj--c7HKw";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
      "access-control-allow-methods": "POST, OPTIONS",
    },
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
    redirect_uri: CALLBACK_URL,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return json({ ok: true, authorization_url: "https://accounts.google.com/o/oauth2/v2/auth?" + p.toString(), redirect_uri: CALLBACK_URL, channel_id_expected: CHANNEL_ID, scopes: ["https://www.googleapis.com/auth/youtube.readonly", "https://www.googleapis.com/auth/yt-analytics.readonly"] });
}
async function refreshAccessToken(saved: any) {
  const expiresAt = Date.parse(String(saved.token_expires_at || ""));
  if (Number.isFinite(expiresAt) && expiresAt > Date.now() + 90_000) return saved;
  if (!saved.refresh_token) throw new Error("Access token expired and no refresh token is available; reconnect through Google consent.");
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error("Google OAuth server configuration is incomplete; reconnect is currently unavailable.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: saved.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    // Do not relay Google's token endpoint body; it can include sensitive details.
    throw new Error("Google could not refresh the access token (HTTP " + response.status + "); reconnect through the official consent flow.");
  }
  const tokenExpiresAt = new Date(Date.now() + Number(result.expires_in || 3600) * 1000).toISOString();
  const nextRefreshToken = result.refresh_token || saved.refresh_token;
  await db(
    "zoz_pro_youtube_analytics_tokens?channel_id=eq." + encodeURIComponent(CHANNEL_ID) + "&owner_id=eq." + encodeURIComponent(saved.owner_id),
    {
      method: "PATCH",
      headers: { prefer: "return=minimal" },
      body: JSON.stringify({
        access_token: result.access_token,
        refresh_token: nextRefreshToken,
        token_expires_at: tokenExpiresAt,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return { ...saved, access_token: result.access_token, refresh_token: nextRefreshToken, token_expires_at: tokenExpiresAt };
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
  const rows = await db("zoz_pro_youtube_analytics_tokens?channel_id=eq." + encodeURIComponent(CHANNEL_ID) + "&owner_id=eq." + encodeURIComponent(u.id) + "&status=eq.active&select=owner_id,access_token,refresh_token,token_expires_at,scopes&limit=1");
  const saved = rows?.[0];
  if (!saved) return fail("ZOZ Pro has no independent OAuth authorization for this channel. Connect YouTube first.", 409);
  if (!Array.isArray(saved.scopes) || !saved.scopes.includes("https://www.googleapis.com/auth/yt-analytics.readonly") || !saved.scopes.includes("https://www.googleapis.com/auth/youtube.readonly")) return fail("The saved authorization lacks the required YouTube read-only scopes.", 403);
  let usable;
  try {
    usable = await refreshAccessToken(saved);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Token refresh failed; reconnect through Google consent.", 409);
  }
  const access = usable.access_token;
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
    const returnedDays = new Set(rows.map((r: any[]) => String(r[0])));
    const missingDates: string[] = [];
    for (let day = Date.parse(start + "T00:00:00Z"), last = Date.parse(end + "T00:00:00Z"); day <= last; day += 86_400_000) {
      const date = new Date(day).toISOString().slice(0, 10);
      if (!returnedDays.has(date)) missingDates.push(date);
    }
    return json({
      ok: true,
      source: "youtube-analytics-api",
      channel_id: CHANNEL_ID,
      start_date: start,
      end_date: end,
      metrics: { ...totals, watch_time_hours: totals.watch_time_minutes / 60, average_view_duration_seconds_weighted: avgSeconds, subscribers_net: totals.subscribers_gained - totals.subscribers_lost },
      daily: rows.map((r: any[]) => ({ date: r[0], views: r[1], estimated_minutes_watched: r[2], average_view_duration_seconds: r[3], subscribers_gained: r[4], subscribers_lost: r[5] })),
      traffic_sources_daily: (traffic.rows || []).map((r: any[]) => ({ date: r[0], source: r[1], views: r[2] })),
      missing_dates: missingDates,
      note: "missing_dates identifies dates for which the API returned no daily row; no values are synthesized. Refresh-token rotation may update only the private credential record. No analytics snapshots are written.",
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "YouTube Analytics request failed.", 502);
  }
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info", "access-control-allow-methods": "POST, OPTIONS" } });
  const url = new URL(req.url);
  if (req.method !== "POST") return fail("Use POST. OAuth callback is handled by the separate callback function.", 405);
  const u = await owner(req);
  if (!u) return fail("Owner authentication required.", 401);
  if (url.searchParams.get("action") === "connect") return await connect(u);
  if (url.searchParams.get("action") === "analytics") return await report(req);
  return fail("Unknown action. Use ?action=connect or ?action=analytics.", 404);
});
