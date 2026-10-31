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
const VIDIQ_MCP_API_KEY = Deno.env.get("VIDIQ_MCP_API_KEY") || "";
const OWNER_EMAIL = Deno.env.get("ZOZ_OWNER_EMAIL") || "";
const SELF = SUPABASE_URL + "/functions/v1/zoz-pro-youtube-analytics";
const CALLBACK_URL = SUPABASE_URL + "/functions/v1/zoz-pro-youtube-oauth-callback";
const CHANNEL_ID = "UCIael48cvwPG3gKj--c7HKw";
const FEKRA_CHANNEL_ID = "UC9fr5B0SZZkmVAApfCqEO3w";
const POLITICAL_CHANNEL_ID = "UC-FimUUFXRd0MOSoikzczcQ";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-zoz-intake-token, x-zoz-autopilot-token",
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
  const internalToken = req.headers.get("x-zoz-autopilot-token") || "";
  if (internalToken) {
    try {
      const valid = await db("rpc/zoz_check_autopilot_secret", { method: "POST", body: JSON.stringify({ p_token: internalToken }) });
      if (valid !== true) return null;
      const ownerId = await db("rpc/zoz_internal_owner_id");
      if (typeof ownerId !== "string" || !ownerId) return null;
      return { id: ownerId, email: OWNER_EMAIL, email_confirmed_at: "internal-scheduled" };
    } catch { return null; }
  }
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
    scope: "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.force-ssl",
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
    if (!r.ok) { const reason = String(data?.error?.errors?.[0]?.reason || data?.error?.status || "unknown"); const message = String(data?.error?.message || "No message returned").slice(0, 240); throw new Error("YouTube Analytics API returned HTTP " + r.status + " (" + reason + "): " + message); }
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

const YOUTUBE_WRITE_SCOPE = "https://www.googleapis.com/auth/youtube.force-ssl";

async function writeToken(u: any, channelId: string = CHANNEL_ID) {
  return await getManagedChannelToken(u, channelId);
}

async function youtubeJson(url: string, access: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { authorization: "Bearer " + access, ...(init.headers as Record<string, string> || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const reason = String(data?.error?.errors?.[0]?.reason || data?.error?.status || "unknown");
    const message = String(data?.error?.message || "No message returned").slice(0, 240);
    throw new Error("YouTube API HTTP " + r.status + " (" + reason + "): " + message);
  }
  return data;
}

async function verifyManagedVideo(videoId: string, access: string, channelId: string = CHANNEL_ID) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID.");
  const p = new URLSearchParams({ part: "snippet,status", id: videoId });
  const data = await youtubeJson("https://www.googleapis.com/youtube/v3/videos?" + p.toString(), access);
  const video = (data.items || [])[0];
  if (!video || video.snippet?.channelId !== channelId) throw new Error("هذا الفيديو لا يتبع القناة المستهدفة؛ لم يتم تغيير أي شيء.");
  return video;
}

async function listVideos(u: any) {
  try {
    const saved = await writeToken(u);
    const channels = await youtubeJson("https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&mine=true&maxResults=50", saved.access_token);
    const channel = (channels.items || []).find((x: any) => x.id === CHANNEL_ID);
    if (!channel) return fail("The authorized Google account does not currently expose the configured Hazem Ahmed channel.", 403);
    const playlistId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!playlistId) return fail("Could not find the uploads playlist for this channel.", 502);
    const pp = new URLSearchParams({ part: "snippet,contentDetails", playlistId, maxResults: "50" });
    const playlist = await youtubeJson("https://www.googleapis.com/youtube/v3/playlistItems?" + pp.toString(), saved.access_token);
    const ids = (playlist.items || []).map((x: any) => String(x.contentDetails?.videoId || x.snippet?.resourceId?.videoId || "")).filter((x: string) => /^[A-Za-z0-9_-]{11}$/.test(x));
    if (!ids.length) return json({ ok: true, channel_id: CHANNEL_ID, videos: [], next_page_token: playlist.nextPageToken || null });
    const vp = new URLSearchParams({ part: "snippet,status", id: ids.join(","), maxResults: String(ids.length) });
    const details = await youtubeJson("https://www.googleapis.com/youtube/v3/videos?" + vp.toString(), saved.access_token);
    const videos = (details.items || []).filter((v: any) => v.snippet?.channelId === CHANNEL_ID).map((v: any) => ({
      video_id: v.id,
      title: v.snippet?.title || "",
      description: v.snippet?.description || "",
      category_id: v.snippet?.categoryId || "22",
      tags: Array.isArray(v.snippet?.tags) ? v.snippet.tags : [],
      default_language: v.snippet?.defaultLanguage || "",
      default_audio_language: v.snippet?.defaultAudioLanguage || "",
      published_at: v.snippet?.publishedAt || "",
      privacy_status: v.status?.privacyStatus || "",
      thumbnail_url: v.snippet?.thumbnails?.maxres?.url || v.snippet?.thumbnails?.standard?.url || v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.medium?.url || v.snippet?.thumbnails?.default?.url || "",
      channel_title: v.snippet?.channelTitle || "Hazem Ahmed"
    }));
    return json({ ok: true, channel_id: CHANNEL_ID, count: videos.length, videos, next_page_token: playlist.nextPageToken || null });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not list channel videos.", 502);
  }
}


/**
 * Read-only per-video analytics report.
 * Restricts every request to the configured channel and IDs found in that
 * channel's uploads playlist. No YouTube video metadata or visibility is changed.
 */
async function videoAnalytics(req: Request) {
  const u = await owner(req);
  if (!u) return fail("Owner authentication required.", 401);
  const body = await req.json().catch(() => ({}));
  const start = String(body.start_date || "");
  const end = String(body.end_date || "");
  const channelId = String(body.channel_id || CHANNEL_ID);
  if (channelId !== CHANNEL_ID) return fail("This endpoint is restricted to the configured Hazem Ahmed channel.", 403);
  if (!validDate(start) || !validDate(end) || start > end || end > new Date().toISOString().slice(0, 10)) {
    return fail("Provide valid start_date and end_date; end_date cannot be in the future.", 400);
  }

  try {
    const tokenRows = await db(
      "zoz_pro_youtube_analytics_tokens?channel_id=eq." + encodeURIComponent(CHANNEL_ID) +
      "&owner_id=eq." + encodeURIComponent(u.id) +
      "&status=eq.active&select=owner_id,access_token,refresh_token,token_expires_at,scopes&limit=1"
    );
    const saved = tokenRows?.[0];
    if (!saved) return fail("ZOZ Pro has no saved Google authorization for this channel.", 409);
    if (!Array.isArray(saved.scopes) ||
        !saved.scopes.includes("https://www.googleapis.com/auth/yt-analytics.readonly") ||
        !saved.scopes.includes("https://www.googleapis.com/auth/youtube.readonly")) {
      return fail("The saved authorization lacks the required read-only YouTube analytics scopes. No new consent was started.", 403);
    }

    const usable = await refreshAccessToken(saved);
    const access = usable.access_token;
    const channelData = await youtubeJson(
      "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true&maxResults=50",
      access
    );
    const channel = (channelData.items || []).find((item: any) => item.id === CHANNEL_ID);
    if (!channel) return fail("The authorized Google account does not expose the configured Hazem Ahmed channel.", 403);
    const uploadsPlaylist = String(channel.contentDetails?.relatedPlaylists?.uploads || "");
    if (!uploadsPlaylist) return fail("Could not find the uploads playlist for the configured channel.", 502);

    const ids: string[] = [];
    const seen = new Set<string>();
    let pageToken = "";
    let truncated = false;
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({ part: "contentDetails,snippet", playlistId: uploadsPlaylist, maxResults: "50" });
      if (pageToken) params.set("pageToken", pageToken);
      const playlist = await youtubeJson("https://www.googleapis.com/youtube/v3/playlistItems?" + params.toString(), access);
      for (const item of (playlist.items || [])) {
        const id = String(item.contentDetails?.videoId || item.snippet?.resourceId?.videoId || "");
        if (/^[A-Za-z0-9_-]{11}$/.test(id) && !seen.has(id)) {
          seen.add(id);
          ids.push(id);
        }
      }
      const next = String(playlist.nextPageToken || "");
      if (!next) break;
      if (ids.length >= 500 || page === 9) {
        truncated = true;
        break;
      }
      pageToken = next;
    }
    if (!ids.length) {
      return json({
        ok: true, source: "youtube-analytics-api", channel_id: CHANNEL_ID,
        start_date: start, end_date: end, videos_scanned: 0,
        analytics_rows_returned: 0, truncated_video_list: false, videos: [],
        note: "No upload IDs were found. No rows or zero metrics were synthesized."
      });
    }

    const params = new URLSearchParams({
      ids: "channel==MINE",
      startDate: start,
      endDate: end,
      metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,likes,comments,shares,subscribersGained,subscribersLost",
      filters: "video==" + ids.join(",")
    });
    // YouTube Analytics permits adding video as a dimension when filtering on
    // multiple video IDs, even where the base report lists no dimensions.
    if (ids.length > 1) params.set("dimensions", "video");
    const response = await fetch("https://youtubeanalytics.googleapis.com/v2/reports?" + params.toString(), {
      headers: { authorization: "Bearer " + access }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const reason = String(result?.error?.errors?.[0]?.reason || result?.error?.status || "unknown");
      const message = String(result?.error?.message || "No message returned").slice(0, 240);
      throw new Error("YouTube per-video Analytics API returned HTTP " + response.status + " (" + reason + "): " + message);
    }
    const headers = (result.columnHeaders || []).map((h: any) => String(h.name || ""));
    const rows = (result.rows || []).map((row: any[]) => {
      const value: Record<string, any> = {};
      headers.forEach((name: string, index: number) => { value[name] = row[index]; });
      const videoId = String(value.video || (ids.length === 1 ? ids[0] : ""));
      return {
        video_id: videoId,
        views: Number(value.views || 0),
        estimated_minutes_watched: Number(value.estimatedMinutesWatched || 0),
        average_view_duration_seconds: Number(value.averageViewDuration || 0),
        average_view_percentage: Number(value.averageViewPercentage || 0),
        likes: Number(value.likes || 0),
        comments: Number(value.comments || 0),
        shares: Number(value.shares || 0),
        subscribers_gained: Number(value.subscribersGained || 0),
        subscribers_lost: Number(value.subscribersLost || 0)
      };
    }).filter((row: any) => /^[A-Za-z0-9_-]{11}$/.test(row.video_id));

    return json({
      ok: true,
      source: "youtube-analytics-api",
      channel_id: CHANNEL_ID,
      start_date: start,
      end_date: end,
      videos_scanned: ids.length,
      analytics_rows_returned: rows.length,
      truncated_video_list: truncated,
      videos: rows,
      note: "Only rows returned by YouTube Analytics are included. Videos without an API row are not synthesized as zero. This endpoint performs read-only reporting and does not change video metadata or visibility."
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not retrieve per-video YouTube Analytics.", 502);
  }
}


function isRecord(value: any): value is Record<string, any> { return !!value && typeof value === "object" && !Array.isArray(value); }
function finiteNumber(value: any, fallback = 0): number { const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : fallback; }
function safeMetricObject(value: any) {
  if (!isRecord(value)) return {};
  const allowed = ["views","watch_time_minutes","watch_time_hours","average_view_duration_seconds_weighted","subscribers_gained","subscribers_lost","subscribers_net"];
  const out: Record<string, number> = {};
  for (const key of allowed) if (value[key] !== undefined && Number.isFinite(Number(value[key]))) out[key] = Number(value[key]);
  return out;
}
async function saveAnalyticsSnapshot(req: Request) {
  const u = await owner(req); if (!u) return fail("Owner authentication required.", 401);
  const body = await req.json().catch(() => ({}));
  if (String(body.channel_id || CHANNEL_ID) !== CHANNEL_ID) return fail("This endpoint is restricted to the configured channel.", 403);
  const start = String(body.start_date || ""), end = String(body.end_date || "");
  if (!validDate(start) || !validDate(end) || start > end || end > new Date().toISOString().slice(0,10)) return fail("Invalid analytics date range.", 400);
  if (!isRecord(body.metrics) || !Array.isArray(body.daily) || !Array.isArray(body.traffic_sources_daily) || !Array.isArray(body.videos)) return fail("Snapshot is incomplete. Refresh analytics and per-video analytics first.", 400);
  if (body.daily.length > 400 || body.traffic_sources_daily.length > 5000 || body.videos.length > 500) return fail("Snapshot exceeds safe record limits.", 413);
  const videos = body.videos.filter((v: any) => isRecord(v) && /^[A-Za-z0-9_-]{11}$/.test(String(v.video_id || "")));
  if (videos.length !== body.videos.length) return fail("One or more video IDs are invalid.", 400);
  const ids = new Set<string>();
  for (const v of videos) { if (ids.has(String(v.video_id))) return fail("Duplicate video ID in snapshot.", 400); ids.add(String(v.video_id)); }
  const videoRows = videos.map((v: any) => ({
    video_id:String(v.video_id), video_title:String(v.title||"").slice(0,500),
    published_at:!Number.isNaN(Date.parse(String(v.published_at||""))) && String(v.published_at||"").length>=10 ? new Date(v.published_at).toISOString() : null,
    privacy_status:["public","private","unlisted"].includes(String(v.privacy_status||"")) ? String(v.privacy_status) : null,
    metrics:isRecord(v.metrics) ? v.metrics : null
  }));
  const metrics=safeMetricObject(body.metrics);
  const daily=body.daily.filter((r:any)=>isRecord(r)&&validDate(String(r.date||""))).map((r:any)=>({
    date:String(r.date),views:finiteNumber(r.views),estimated_minutes_watched:finiteNumber(r.estimated_minutes_watched),
    average_view_duration_seconds:finiteNumber(r.average_view_duration_seconds),subscribers_gained:finiteNumber(r.subscribers_gained),subscribers_lost:finiteNumber(r.subscribers_lost)
  }));
  const traffic=body.traffic_sources_daily.filter((r:any)=>isRecord(r)&&validDate(String(r.date||""))).map((r:any)=>({date:String(r.date),source:String(r.source||"UNKNOWN").slice(0,100),views:finiteNumber(r.views)}));
  const missing=Array.isArray(body.missing_dates)?body.missing_dates.filter((x:any)=>validDate(String(x))).map(String).slice(0,400):[];
  const day=new Date().toISOString().slice(0,10);
  try {
    const parent=await db("zoz_pro_youtube_analytics_snapshots?on_conflict=owner_id,channel_id,start_date,end_date,snapshot_day",{
      method:"POST",headers:{prefer:"resolution=merge-duplicates,return=representation"},
      body:JSON.stringify([{owner_id:u.id,channel_id:CHANNEL_ID,start_date:start,end_date:end,snapshot_day:day,metrics,daily_metrics:daily,traffic_sources_daily:traffic,missing_dates:missing,video_count:videoRows.length,analytics_video_count:videoRows.filter((v:any)=>isRecord(v.metrics)).length,source:"youtube-analytics-api",updated_at:new Date().toISOString()}])
    });
    const snapshotId=String(parent?.[0]?.id||""); if(!snapshotId) throw new Error("Snapshot record was not returned by the database.");
    await db("zoz_pro_youtube_video_analytics_snapshots?snapshot_id=eq."+encodeURIComponent(snapshotId),{method:"DELETE",headers:{prefer:"return=minimal"}});
    if(videoRows.length) await db("zoz_pro_youtube_video_analytics_snapshots",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify(videoRows.map((v:any)=>({snapshot_id:snapshotId,...v})))});
    const recommendations:any[]=[];
    const scored=videoRows.filter((v:any)=>isRecord(v.metrics)).map((v:any)=>({...v,m:v.metrics})).sort((a:any,b:any)=>finiteNumber(b.m.views)-finiteNumber(a.m.views));
    const top=scored[0];
    if(top&&finiteNumber(top.m.views)>=20){
      recommendations.push({snapshot_id:snapshotId,owner_id:u.id,channel_id:CHANNEL_ID,recommendation_key:"repeat-winner",recommendation_type:"repeat_winner",title:"اختبر جزءًا ثانيًا من الموضوع الأعلى مشاهدة",body:"الفيديو «"+String(top.video_title||top.video_id).slice(0,180)+"» هو الأعلى مشاهدة ضمن هذه الفترة. أنشئ فكرة تكميلية جديدة حول نفس السؤال، مع افتتاحية مختلفة، ثم قارن النتائج بعد النشر بموافقتك.",evidence:{video_id:top.video_id,video_title:top.video_title,views:finiteNumber(top.m.views),average_view_percentage:finiteNumber(top.m.average_view_percentage),period_start:start,period_end:end}});
      if(finiteNumber(top.m.average_view_percentage)>0&&finiteNumber(top.m.average_view_percentage)<45) recommendations.push({snapshot_id:snapshotId,owner_id:u.id,channel_id:CHANNEL_ID,recommendation_key:"retention-top",recommendation_type:"retention",title:"اختبر افتتاحية أسرع للفيديو الأعلى مشاهدة",body:"رغم أن الفيديو «"+String(top.video_title||top.video_id).slice(0,180)+"» جلب مشاهدات، فإن متوسط المشاهدة المسجل "+finiteNumber(top.m.average_view_percentage)+"%. جرّب بدء النسخة القادمة بالنتيجة أو السؤال مباشرة، وقلّل المقدمة قبل الحكم على أثر التغيير.",evidence:{video_id:top.video_id,views:finiteNumber(top.m.views),average_view_percentage:finiteNumber(top.m.average_view_percentage),period_start:start,period_end:end}});
    }
    const totalTrafficViews=traffic.reduce((s:number,r:any)=>s+finiteNumber(r.views),0);
    const shortsViews=traffic.filter((r:any)=>String(r.source).toUpperCase()==="SHORTS").reduce((s:number,r:any)=>s+finiteNumber(r.views),0);
    if(totalTrafficViews>0&&shortsViews/totalTrafficViews>=0.5) recommendations.push({snapshot_id:snapshotId,owner_id:u.id,channel_id:CHANNEL_ID,recommendation_key:"shorts-discovery",recommendation_type:"topic_test",title:"واصل اختبار Shorts مع سلسلة مترابطة",body:"مصدر Shorts يمثل "+Math.round(shortsViews/totalTrafficViews*100)+"% من المشاهدات في بيانات مصادر الزيارات المسجلة. اختبر حلقة قصيرة ثانية مرتبطة بأفضل موضوع، مع دعوة طبيعية لمشاهدة الحلقة التالية؛ لا تنشر تلقائيًا.",evidence:{shorts_views:shortsViews,traffic_source_views:totalTrafficViews,period_start:start,period_end:end}});
    if(missing.length) recommendations.push({snapshot_id:snapshotId,owner_id:u.id,channel_id:CHANNEL_ID,recommendation_key:"data-gaps",recommendation_type:"measurement",title:"تحقق من الأيام التي لم تُرجع بيانات",body:"لم تُرجع واجهة YouTube صفًا يوميًا لـ "+missing.length+" يومًا في الفترة المختارة. لا تُفسر الأيام المفقودة على أنها صفر؛ أعد الفحص لاحقًا قبل المقارنة اليومية.",evidence:{missing_dates:missing,period_start:start,period_end:end}});
    if(recommendations.length) await db("zoz_pro_content_recommendations?on_conflict=snapshot_id,recommendation_key",{method:"POST",headers:{prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(recommendations)});
    return json({ok:true,snapshot_id:snapshotId,snapshot_day:day,video_count:videoRows.length,analytics_video_count:videoRows.filter((v:any)=>isRecord(v.metrics)).length,recommendations_generated:recommendations.length,message:"Saved a private historical analytics snapshot. No YouTube content was changed or published."});
  } catch(e) { return fail(e instanceof Error?e.message:"Could not save analytics snapshot.",502); }
}
async function analyticsHistory(req: Request) {
  const u=await owner(req); if(!u)return fail("Owner authentication required.",401);
  const rows=await db("zoz_pro_youtube_analytics_snapshots?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(CHANNEL_ID)+"&select=id,start_date,end_date,snapshot_day,metrics,video_count,analytics_video_count,missing_dates,created_at,updated_at&order=snapshot_day.desc,created_at.desc&limit=30");
  return json({ok:true,channel_id:CHANNEL_ID,snapshots:rows||[]});
}
async function listRecommendations(req: Request) {
  const u=await owner(req); if(!u)return fail("Owner authentication required.",401);
  const rows=await db("zoz_pro_content_recommendations?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(CHANNEL_ID)+"&select=id,snapshot_id,recommendation_type,title,body,evidence,status,created_at,updated_at,reviewed_at&order=created_at.desc&limit=100");
  return json({ok:true,channel_id:CHANNEL_ID,recommendations:rows||[]});
}

const calendarFields = "id,snapshot_id,planned_date,sequence_no,format,content_pillar,working_title,hook,outline,cta,evidence,source_video_id,status,owner_note,production_package,created_at,updated_at";

async function getContentCalendar(req: Request) {
  const user = await owner(req);
  if (!user) return fail("Owner authentication required.", 401);
  try {
    // Prefer the newest snapshot that actually has a saved calendar.
    // A fresh analytics snapshot must not hide the owner's previously saved plan.
    const snapshots = await db("zoz_pro_youtube_analytics_snapshots?owner_id=eq." + encodeURIComponent(user.id) + "&channel_id=eq." + encodeURIComponent(CHANNEL_ID) + "&select=id,start_date,end_date,snapshot_day&order=created_at.desc&limit=20");
    const list = Array.isArray(snapshots) ? snapshots : [];
    const latest = list[0] || null;
    for (let i = 0; i < list.length; i++) {
      const snap = list[i];
      const rows = await db("zoz_pro_content_calendar?owner_id=eq." + encodeURIComponent(user.id) + "&channel_id=eq." + encodeURIComponent(CHANNEL_ID) + "&snapshot_id=eq." + encodeURIComponent(snap.id) + "&select=" + calendarFields + "&order=sequence_no.asc&limit=20");
      if (Array.isArray(rows) && rows.length) {
        return json({ok:true,channel_id:CHANNEL_ID,snapshot_id:snap.id,snapshot_day:snap.snapshot_day,start_date:snap.start_date,end_date:snap.end_date,calendar:rows,using_saved_calendar_snapshot:i>0,latest_snapshot_id:latest?.id||null});
      }
    }
    return json({ok:true,channel_id:CHANNEL_ID,snapshot_id:latest?.id||null,snapshot_day:latest?.snapshot_day||null,start_date:latest?.start_date||null,end_date:latest?.end_date||null,calendar:[],using_saved_calendar_snapshot:false});
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not load content calendar.", 502);
  }
}

async function generateContentCalendar(req: Request) {
  const user = await owner(req);
  if (!user) return fail("Owner authentication required.", 401);
  const body = await req.json().catch(() => ({}));
  if (String(body.channel_id || CHANNEL_ID) !== CHANNEL_ID) return fail("This endpoint is restricted to the configured channel.", 403);
  try {
    const snapshots = await db("zoz_pro_youtube_analytics_snapshots?owner_id=eq." + encodeURIComponent(user.id) + "&channel_id=eq." + encodeURIComponent(CHANNEL_ID) + "&select=id,snapshot_day,start_date,end_date,metrics&order=created_at.desc&limit=1");
    const snap = snapshots?.[0];
    if (!snap) return fail("احفظ لقطة تحليل تاريخية أولًا قبل إنشاء التقويم.", 409);
    const snapshotId = String(snap.id);
    const path = "zoz_pro_content_calendar?owner_id=eq." + encodeURIComponent(user.id) + "&channel_id=eq." + encodeURIComponent(CHANNEL_ID) + "&snapshot_id=eq." + encodeURIComponent(snapshotId);
    const existing = await db(path + "&select=" + calendarFields + "&order=sequence_no.asc&limit=20");
    if (Array.isArray(existing) && existing.length >= 7) {
      return json({ok:true,created:false,snapshot_id:snapshotId,calendar:existing,message:"الخطة الأسبوعية موجودة بالفعل؛ احتفظنا بالمسودات وحالات المراجعة كما هي."});
    }

    const sourceRows = await db("zoz_pro_youtube_video_analytics_snapshots?snapshot_id=eq." + encodeURIComponent(snapshotId) + "&select=video_id,video_title,metrics&limit=500");
    const scored = (sourceRows || []).filter((v:any) => isRecord(v.metrics)).sort((a:any,b:any) => finiteNumber(b.metrics.views)-finiteNumber(a.metrics.views));
    const best = scored[0] || null;
    const second = scored[1] || null;
    const ideaCatalog = [
      {format:"short",pillar:"أسرار الفن المصري",title:"ليه نب آمون أكبر من الفلاحين في الرسمة؟",hook:"بصّ على المشهد ده: ليه نب آمون مرسوم أكبر من الفلاحين اللي حواليه؟",outline:["اعرض مشهد نب آمون من مصدر متحفي وحدد الشخصيات.","اشرح أن فرق الحجم قد يعبّر عن المكانة لا الطول الحقيقي.","اربط الشرح بمرجع المتحف البريطاني.","اختم بسؤال يدعو لاختيار لغز فني آخر."],cta:"تحب نفك سرّ أي تفصيلة تانية في الفن المصري القديم؟",source:best?.video_id||null,evidence:{topic_key:"hierarchical_scale_nebamun",basis:"تكملة جديدة للموضوع الفني الأعلى أداءً دون إعادة سؤال العين والوجه",reference:"https://www.britishmuseum.org/sites/default/files/2020-10/R61_Egyptian_life_and_death_large_print_guide.pdf",fact_check_required:true}},
      {format:"short",pillar:"أسرار الفن المصري",title:"ليه الرسومات المصرية القديمة متقسمة لصفوف؟",hook:"ليه المشهد المصري القديم متقسم لشرائط أفقية بدل ما يبقى صورة واحدة؟",outline:["اعرض أثرًا واضحًا فيه مستويات أفقية.","اشرح كيف تساعد المستويات على تنظيم المشاهد.","وضح أن التفسير يحتاج إلى سياق القطعة.","اربط بالفيديو السابق دون تكرار موضوع زوايا الجسم."],cta:"تحب الحلقة الجاية عن الرموز ولا عن حياة الناس العاديين؟",source:second?.video_id||null,evidence:{topic_key:"egyptian_art_registers",basis:"موضوع مجاور لفن مصر القديمة بسؤال مختلف عن زوايا الجسم",reference:"https://smarthistory.org/ancient-egyptian-art/",fact_check_required:true}},
      {format:"short",pillar:"الحياة اليومية والوثائق",title:"بردية عمرها نحو 4000 سنة تكشف شؤون بيت مصري",hook:"إزاي وثيقة عمرها قرابة 4000 سنة تساعدنا نفهم إدارة بيت في مصر القديمة؟",outline:["اعرض حسابات حقاناخت من مجموعة The Met.","اشرح ما تقوله القطعة عن الإدارة والشؤون المالية والأسرية.","ميّز بين نص المصدر والاستنتاج.","اختم بسؤال عن وثيقة أخرى."],cta:"تحب نشوف رسالة قديمة ولا سجل حسابات في الحلقة الجاية؟",source:null,evidence:{topic_key:"heqanakht_account_household",reference:"https://www.metmuseum.org/art/collection/search/545450",fact_check_required:true}},
      {format:"short",pillar:"الأهرامات والأدلة الأثرية",title:"مدينة بناة الأهرامات: ماذا كشف موقع هيت الغراب؟",hook:"لو بنوا الأهرامات، أين عاش العمال والحرفيون والإداريون؟",outline:["حدد موقع هيت الغراب جنوب أبو الهول.","اشرح ما تكشفه الحفريات عن المستوطنة.","وضح ما لا يحسمه الموقع وحده عن تقنيات البناء.","ضع مصدرًا أثريًا في الوصف."],cta:"ما الدليل الأثري الذي تريد أن نفحصه بعد ذلك؟",source:"tPVNAlC9cCU",evidence:{topic_key:"giza_heg_gurab_settlement",reference:"https://aeraweb.org/projects/lost-city/",additional_reference:"https://giza.fas.harvard.edu/faq/",fact_check_required:true}},
      {format:"long",pillar:"حياة الحرفيين",title:"داخل دير المدينة: كيف عاش الفنانون الذين صنعوا المقابر الملكية؟",hook:"وراء مقابر الملوك المزخرفة كان فيه فريق متخصص يعيش ويعمل ويسجل تفاصيله اليومية.",outline:["مقدمة بالدليل الذي تركه الحرفيون في القرية والوثائق.","تعريف دير المدينة وفريق المقابر الملكية.","شرح الأوستراكا والبرديات بوصفها مصادر يومية.","أمثلة موثقة على الوثائق والعمل.","حدود الأدلة وما لا يصح تعميمه.","خاتمة تربط المصادر بالمشاهد الأثرية."],cta:"أي مهنة قديمة تريد أن نبحث عنها بعد ذلك؟",source:null,evidence:{topic_key:"deir_el_medina_artisans_longform",reference:"https://www.ucl.ac.uk/museums-static/digitalegypt/deirelmedine/ostraca.html",fact_check_required:true}},
      {format:"short",pillar:"الكتابة والسجلات",title:"قطعة حجرية سجلت أسماء عمال وغيابهم",hook:"تخيل أن قائمة أسماء عمال وبعض الغياب من أكثر من ثلاثة آلاف سنة ما زالت محفوظة.",outline:["اعرض قطعة أوستراكا من مجموعة The Met.","اشرح أن بعض الأوستراكا قطع حجر أو فخار للكتابة أو الرسم.","اذكر ما يقوله مرجع القطعة عن الأسماء والغياب فقط.","لا تخمّن أسباب الغياب."],cta:"تحب تشوف سجلًا حقيقيًا آخر من حياة العمال؟",source:null,evidence:{topic_key:"met_ostracon_worker_absences",reference:"https://www.metmuseum.org/art/collection/search/561349",fact_check_required:true}},
      {format:"short",pillar:"الرموز والكتابة المصرية",title:"إزاي تعرف اسم الملك في النقش المصري؟ السر في الخرطوشة",hook:"شايف الإطار البيضاوي اللي حوالين العلامات دي؟ أحيانًا بيساعدنا نميّز اسم الملك أو الملكة.",outline:["اعرض خرطوشة من قطعة متحفية محددة.","اشرح أن الخرطوشة تحيط باسم ملكي في كثير من النقوش.","استخدم مثالًا موثقًا من مجموعة متحف.","لا تقرأ علامات دون ترجمة موثوقة."],cta:"أي اسم ملك تحب نقرأه معًا بعد ذلك؟",source:null,evidence:{topic_key:"cartouche_reading_royal_names",reference:"https://www.britishmuseum.org/learn/schools/ages-7-11/ancient-egypt/cracking-cartouches-game",additional_reference:"https://www.metmuseum.org/art/collection/search/551412",fact_check_required:true}},
      {format:"short",pillar:"تحولات الفن المصري",title:"ليه ملامح إخناتون في الفن مختلفة عن ملوك قبله؟",hook:"ملامح إخناتون في بعض التماثيل مختلفة بشكل واضح؛ هل نرى أسلوبًا فنيًا جديدًا؟",outline:["اعرض نموذجًا موثقًا لوجه إخناتون.","اشرح سياق فن العمارنة في عهده.","فرّق بين وصف المتحف والتأويلات الحديثة.","لا تشخّص شكل الملك أو تختزل التغيير في سبب واحد."],cta:"تحب نقارن قطعة أخرى من عصر العمارنة؟",source:null,evidence:{topic_key:"amarna_art_akhenaten",reference:"https://www.metmuseum.org/art/collection/search/545909",fact_check_required:true}},
      {format:"short",pillar:"الحيوانات والمعتقدات",title:"ليه القطط ظهرت في تماثيل نذرية بمصر القديمة؟",hook:"التمثال ده مش مجرد صورة قطة؛ له ارتباط بمعتقدات وممارسات دينية.",outline:["اعرض تمثال قطة محددًا من The Met.","اشرح ارتباط القطط بباستت وفق وصف المتحف.","وضح أن الوظيفة تختلف حسب القطعة والفترة.","اذكر الفترة من بطاقة القطعة."],cta:"أي حيوان مقدس تحب نعرف قصته؟",source:null,evidence:{topic_key:"cat_statues_bastet",reference:"https://www.metmuseum.org/art/collection/search/570737",fact_check_required:true}},
      {format:"short",pillar:"الكتبة والفن",title:"تمثال الكاتب الجالس: لماذا تبدو عيناه حقيقيتين؟",hook:"عينان تلمعان داخل تمثال عمره آلاف السنين؛ ما سر صناعتهما؟",outline:["اعرض تمثال الكاتب الجالس من مجموعة اللوفر.","اشرح المواد التي يذكرها سجل القطعة للعينين.","وضح أن هوية الرجل غير معروفة وفق سجل المتحف.","لا تنسب له اسمًا أو منصبًا بلا دليل."],cta:"تحب نفحص سرًا آخر في قطعة متحفية؟",source:null,evidence:{topic_key:"louvre_seated_scribe_eyes",reference:"https://collections.louvre.fr/en/ark:/53355/cl010006582",fact_check_required:true}},
      {format:"short",pillar:"الحيوانات والطقوس",title:"لماذا حُنّطت بعض الحيوانات في مصر القديمة؟",hook:"لم تكن كل مومياوات مصر القديمة بشرية؛ بعض الحيوانات ارتبطت بطقوس دينية.",outline:["اعرض مومياء حيوانية موثقة من The Met.","اشرح ما يقوله المتحف عن الممارسة في الفترة المحددة.","لا تعمم على كل العصور أو كل الحيوانات.","اذكر بيانات القطعة."],cta:"تحب نكتشف قصة حيوان آخر في مصر القديمة؟",source:null,evidence:{topic_key:"animal_mummies_cat_cults",reference:"https://www.metmuseum.org/art/collection/search/552443",fact_check_required:true}},
      {format:"short",pillar:"الحياة اليومية والجمال",title:"كيف كان المصري القديم يستخدم الكحل؟",hook:"الأداة الصغيرة دي كانت جزءًا من أدوات الزينة قبل آلاف السنين.",outline:["اعرض طقم كحل أو أداة تطبيق موثقة.","اذكر المادة والأداة حسب وصف القطعة.","لا تدّعِ استخدامًا طبيًا دون مصدر.","اعرض تاريخ القطعة ومادتها."],cta:"أي أداة يومية قديمة نعرضها بعد ذلك؟",source:null,evidence:{topic_key:"ancient_egypt_kohl_kit",reference:"https://www.metmuseum.org/art/collection/search/547624",fact_check_required:true}},
      {format:"short",pillar:"المقابر والمعتقدات",title:"لماذا ظهرت مشاهد الطعام والشراب في مقابر مصر القديمة؟",hook:"لماذا رسم المصريون الطعام على جدران أو نماذج داخل المقابر؟",outline:["اعرض مشهد قرابين موثقًا من مصدر متحفي.","اشرح التفسير الذي يدعمه المرجع.","ميّز بين المشهد المصور والقرابين الفعلية.","لا تعمم التفسير على كل مقبرة."],cta:"أي رمز جنائزي تريد أن نفسره بعد ذلك؟",source:null,evidence:{topic_key:"food_offerings_middle_kingdom",reference:"https://www.metmuseum.org/de/perspectives/food-and-feasts-in-middle-kingdom-egypt",fact_check_required:true}},
      {format:"short",pillar:"الرموز والحيوانات",title:"ما علاقة طائر الإيبس بالإله تحوت؟",hook:"لماذا يظهر طائر الإيبس على صندوق صغير مرتبط بمومياء حيوانية؟",outline:["اعرض قطعة الإيبس من مجموعة The Met.","اشرح ارتباط الإيبس بتحوت وفق وصف المتحف.","اشرح بحذر وظيفة القطعة كما يصفها المصدر.","لا تجزم بوظيفة غير مؤكدة."],cta:"أي رمز أو حيوان تريد أن نستكشف قصته؟",source:null,evidence:{topic_key:"ibis_thoth_votive_box",reference:"https://www.metmuseum.org/art/collection/search/552025",fact_check_required:true}}
    ];
    const historyRows = await db("zoz_pro_content_calendar?owner_id=eq." + encodeURIComponent(user.id) + "&channel_id=eq." + encodeURIComponent(CHANNEL_ID) + "&select=snapshot_id,working_title,evidence,status&order=created_at.desc&limit=500");
    const usedTopicKeys = new Set((historyRows || []).filter((x:any) => String(x.snapshot_id || "") !== snapshotId).map((x:any) => String(x.evidence?.topic_key || "")).filter(Boolean));
    const usedTitles = new Set((historyRows || []).filter((x:any) => String(x.snapshot_id || "") !== snapshotId).map((x:any) => String(x.working_title || "").trim().toLocaleLowerCase("ar")).filter(Boolean));
    const ideas = ideaCatalog.filter((idea:any) => !usedTopicKeys.has(String(idea.evidence?.topic_key || "")) && !usedTitles.has(String(idea.title || "").trim().toLocaleLowerCase("ar")));
    const baseText = String(snap.snapshot_day || new Date().toISOString().slice(0,10));
    const baseDate = new Date(baseText + "T00:00:00Z");
    if (Number.isNaN(baseDate.getTime())) throw new Error("تعذر قراءة تاريخ لقطة التحليل.");
    const existingSeq = new Set((existing||[]).map((x:any) => Number(x.sequence_no)));
    const rows:any[] = [];
    for (let i=0;i<ideas.length;i++) {
      const sequence=i+1;
      if (existingSeq.has(sequence)) continue;
      const date=new Date(baseDate); date.setUTCDate(date.getUTCDate()+sequence);
      const idea=ideas[i];
      rows.push({
        owner_id:user.id, channel_id:CHANNEL_ID, snapshot_id:snapshotId,
        planned_date:date.toISOString().slice(0,10),sequence_no:sequence,
        format:idea.format,content_pillar:idea.pillar,working_title:idea.title,hook:idea.hook,
        outline:idea.outline,cta:idea.cta,source_video_id:idea.source,status:"draft",
        evidence:{...idea.evidence,analytics_period_start:snap.start_date,analytics_period_end:snap.end_date,source_snapshot_id:snapshotId}
      });
    }
    if (!rows.length) return json({ok:true,created:false,snapshot_id:snapshotId,calendar:existing||[],message:"لا توجد موضوعات جديدة غير مستخدمة في مخزون الأفكار الحالي. لم أنشئ تكرارات؛ أضف مصادر وموضوعات جديدة إلى بنك المحتوى."});
    if (rows.length) await db("zoz_pro_content_calendar?on_conflict=snapshot_id,sequence_no",{method:"POST",headers:{prefer:"resolution=ignore-duplicates,return=minimal"},body:JSON.stringify(rows)});
    const finalRows=await db(path + "&select=" + calendarFields + "&order=sequence_no.asc&limit=20");
    return json({ok:true,created:rows.length>0,snapshot_id:snapshotId,calendar:finalRows||[],message:"حُفظت مسودات التقويم في قاعدة الإنتاج. لا يوجد نشر تلقائي؛ تحقق من الحقائق والمراجع قبل الإنتاج."});
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not generate content calendar.", 502);
  }
}

async function reviewContentCalendarItem(req: Request) {
  const user=await owner(req); if(!user)return fail("Owner authentication required.",401);
  const body=await req.json().catch(()=>({}));
  const id=String(body.calendar_item_id||""), next=String(body.status||""), note=String(body.note||"").slice(0,1000);
  if(!/^[0-9a-f-]{36}$/i.test(id)||!["approved","in_production","ready_for_review","completed","dismissed"].includes(next))return fail("Invalid calendar item ID or status.",400);
  try{
    const found=await db("zoz_pro_content_calendar?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(user.id)+"&channel_id=eq."+encodeURIComponent(CHANNEL_ID)+"&select=id,status&limit=1");
    if(!found?.[0])return fail("Calendar item not found for this owner and channel.",404);
    const from=String(found[0].status||"draft");
    const transitions:Record<string,string[]>={draft:["approved","dismissed"],approved:["in_production","dismissed"],in_production:["ready_for_review","dismissed"],ready_for_review:["completed","in_production","dismissed"],completed:[],dismissed:[]};
    if(!(transitions[from]||[]).includes(next))return fail("This status transition is not allowed.",409);
    const updated=await db("zoz_pro_content_calendar?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(user.id)+"&channel_id=eq."+encodeURIComponent(CHANNEL_ID),{method:"PATCH",headers:{prefer:"return=representation"},body:JSON.stringify({status:next,owner_note:note||null,updated_at:new Date().toISOString()})});
    if(!updated?.length)return fail("Calendar item status was not saved.",409);
    await db("zoz_pro_content_calendar_reviews",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({calendar_item_id:id,owner_id:user.id,from_status:from,to_status:next,note})});
    return json({ok:true,calendar_item_id:id,status:next,message:"Calendar status and review note saved. No YouTube content was changed or published."});
  }catch(e){return fail(e instanceof Error?e.message:"Could not update calendar item.",502);}
}


async function reviewRecommendation(req: Request) {
  const u=await owner(req); if(!u)return fail("Owner authentication required.",401);
  const body=await req.json().catch(()=>({})); const id=String(body.recommendation_id||""); const status=String(body.status||""); const note=String(body.note||"").slice(0,1000);
  if(!/^[0-9a-f-]{36}$/i.test(id)||!["approved","dismissed","implemented"].includes(status))return fail("Invalid recommendation ID or review status.",400);
  try {
    const prior=await db("zoz_pro_content_recommendations?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(CHANNEL_ID)+"&select=id,status&limit=1");
    if(!prior?.[0])return fail("Recommendation not found for this owner and channel.",404);
    const fromStatus=String(prior[0].status||"draft");
    const updated=await db("zoz_pro_content_recommendations?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(CHANNEL_ID),{method:"PATCH",headers:{prefer:"return=representation"},body:JSON.stringify({status,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    if(!updated?.length)return fail("Recommendation status was not updated.",409);
    await db("zoz_pro_content_review_log",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({recommendation_id:id,owner_id:u.id,from_status:fromStatus,to_status:status,note})});
    return json({ok:true,recommendation_id:id,status,message:"Recommendation review saved. No channel content was changed."});
  } catch(e){return fail(e instanceof Error?e.message:"Could not save recommendation review.",502);}
}

async function updateVideo(u: any, body: any) {
  try {
    if (body?.confirm !== true) return fail("Confirmation is required before saving video metadata.", 400);
    const videoId = String(body.video_id || "");
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "");
    if (!title) return fail("Title cannot be empty.", 400);
    if (title.length > 100 || /[<>]/.test(title)) return fail("Title must be at most 100 characters and cannot contain < or >.", 400);
    if (new TextEncoder().encode(description).length > 5000 || /[<>]/.test(description)) return fail("Description must be at most 5,000 UTF-8 bytes and cannot contain < or >.", 400);
    const saved = await writeToken(u);
    const current = await verifyManagedVideo(videoId, saved.access_token);
    const old = current.snippet || {};
    const snippet: Record<string, unknown> = {
      title,
      description,
      categoryId: String(old.categoryId || "22")
    };
    if (Array.isArray(old.tags)) snippet.tags = old.tags;
    if (old.defaultLanguage) snippet.defaultLanguage = old.defaultLanguage;
    if (old.defaultAudioLanguage) snippet.defaultAudioLanguage = old.defaultAudioLanguage;
    const data = await youtubeJson("https://www.googleapis.com/youtube/v3/videos?part=snippet", saved.access_token, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: videoId, snippet })
    });
    return json({ ok: true, video_id: videoId, title: data.snippet?.title || title, description: data.snippet?.description ?? description, updated: ["title", "description"], message: "Title and description updated. No publishing or visibility setting was changed." });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Video metadata update failed.", 502);
  }
}

async function setThumbnail(req: Request, u: any) {
  try {
    const form = await req.formData();
    if (String(form.get("confirm") || "") !== "true") return fail("Confirmation is required before changing a thumbnail.", 400);
    const videoId = String(form.get("video_id") || "");
    const image = form.get("thumbnail");
    if (!(image instanceof File)) return fail("Choose a JPEG or PNG thumbnail image.", 400);
    if (!["image/jpeg", "image/png"].includes(image.type)) return fail("Only JPEG and PNG images are accepted.", 400);
    if (image.size < 1 || image.size > 5 * 1024 * 1024) return fail("Thumbnail image must be smaller than 5 MB in this initial version.", 400);
    const saved = await writeToken(u);
    await verifyManagedVideo(videoId, saved.access_token);
    const bytes = new Uint8Array(await image.arrayBuffer());
    const p = new URLSearchParams({ videoId });
    const data = await youtubeJson("https://www.googleapis.com/upload/youtube/v3/thumbnails/set?" + p.toString(), saved.access_token, {
      method: "POST",
      headers: { "content-type": image.type },
      body: bytes
    });
    return json({ ok: true, video_id: videoId, thumbnail: data.items?.[0]?.default?.url || null, message: "Custom thumbnail uploaded. No video publishing or visibility setting was changed." });
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Thumbnail update failed.", 502);
  }
}

const INTAKE_BUCKET="zoz-pro-intake";
const INTAKE_CHUNK_BYTES=8388608;
async function intakeAuth(req:Request){
 const token=req.headers.get("x-zoz-intake-token")||"";
 if(token.length<32)return null;
 const rows=await db("zoz_pro_video_intake_sources?secret_hash=eq."+encodeURIComponent(await sha(token))+"&is_active=eq.true&select=id,owner_id,channel_id,source_name,expires_at&limit=1");
 const row=rows?.[0];
 if(!row||row.channel_id!==CHANNEL_ID||(row.expires_at&&Date.parse(row.expires_at)<Date.now()))return null;
 await db("zoz_pro_video_intake_sources?id=eq."+encodeURIComponent(row.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({last_used_at:new Date().toISOString()})});
 return {id:row.owner_id,email:OWNER_EMAIL,channel_id:row.channel_id,source_id:row.id,source_name:row.source_name,is_intake_source:true};
}
async function intakeAsset(u:any,id:string,expectedChannelId?:string){
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("Invalid intake asset id.");
 const rows=await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&select=*&limit=1");
 const asset=rows?.[0];
 if(!asset)throw new Error("Intake asset not found for this owner.");
 const requiredChannel=expectedChannelId||(u.is_intake_source?String(u.channel_id||""):"");
 if(requiredChannel&&asset.channel_id!==requiredChannel)throw new Error("ملف الاستقبال تابع لقناة أخرى؛ لا يمكن لمركز أو قناة أخرى التحكم فيه.");
 return asset;
}

async function intakeEvent(a:any,type:string,from:string|null,to:string|null,details:any={}){
 await db("zoz_pro_video_intake_events",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({asset_id:a?.id||null,owner_id:a?.owner_id||null,source_name:a?.source_name||"ZOZ Pro",event_type:type,from_status:from,to_status:to,details})});
}
function intakeText(v:any,n:number){return String(v??"").trim().slice(0,n);}
async function intakeCreate(req:Request,u:any){
 const b=await req.json().catch(()=>({}));
 const channelId=String(u.is_intake_source?u.channel_id:(b.channel_id||CHANNEL_ID));
 const filename=intakeText(b.filename,240),bytes=Number(b.total_bytes),type=intakeText(b.content_type||"video/mp4",100);
 if(!/^UC[A-Za-z0-9_-]{22}$/.test(channelId))return fail("معرّف القناة المستهدفة غير صالح.",400);
 if(u.is_intake_source&&channelId!==String(u.channel_id||""))return fail("رمز مركز الإنتاج مخصص لقناة واحدة فقط.",403);
 const registered=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=channel_id,is_active,display_name&limit=1");
 if(!registered?.[0]||registered[0].is_active===false)return fail("القناة غير مسجلة أو غير نشطة في إدارة ZOZ Pro.",404);
 if(!filename||!Number.isSafeInteger(bytes)||bytes<1||bytes>850*1024*1024)return fail("اختر ملفًا بحجم من 1 بايت إلى 850 ميجابايت.",400);
 if(!/^(video\/(mp4|quicktime|webm|x-matroska)|application\/octet-stream)$/i.test(type))return fail("الصيغ المدعومة: MP4 وMOV وWebM وMKV.",415);
 const count=Math.ceil(bytes/INTAKE_CHUNK_BYTES),prefix=u.id+"/"+crypto.randomUUID();
 const body={owner_id:u.id,channel_id:channelId,source_id:u.is_intake_source?u.source_id:null,source_name:u.is_intake_source?u.source_name:"رفع يدوي من ZOZ Pro",original_filename:filename,content_type:type,total_bytes:bytes,chunk_size:INTAKE_CHUNK_BYTES,chunk_count:count,storage_prefix:prefix,title:intakeText(b.title||filename.replace(/\.[^.]+$/,""),100),description:intakeText(b.description,5000),tags:Array.isArray(b.tags)?b.tags.map((x:any)=>intakeText(x,100)).filter(Boolean).slice(0,30):[],made_for_kids:typeof b.made_for_kids==="boolean"?b.made_for_kids:null,contains_synthetic_media:typeof b.contains_synthetic_media==="boolean"?b.contains_synthetic_media:null,target_privacy_status:b.target_privacy_status==="unlisted"?"unlisted":"public",status:"uploading",metadata:{integration_version:"zoz-intake-channel-v2",channel_display_name:registered[0].display_name}};
 const rows=await db("zoz_pro_video_intake_assets",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify(body)}),a=rows?.[0];
 if(!a)throw new Error("Could not create intake record.");
 await intakeEvent(a,"intake_created",null,"uploading",{chunk_count:count,total_bytes:bytes,channel_id:channelId});
 return json({ok:true,asset:{id:a.id,status:a.status,channel_id:channelId,channel_display_name:registered[0].display_name,chunk_size:INTAKE_CHUNK_BYTES,chunk_count:count,total_bytes:bytes,source_name:a.source_name}});
}

async function intakeSignPart(req:Request,u:any){
 const b=await req.json().catch(()=>({})),a=await intakeAsset(u,String(b.asset_id||"")),part=Number(b.part_index);
 if(a.status!=="uploading")return fail("Asset is not accepting uploads.",409);
 if(!Number.isInteger(part)||part<0||part>=a.chunk_count)return fail("Invalid part index.",400);
 const path=a.storage_prefix+"/part-"+String(part).padStart(5,"0")+".bin";
 const r=await fetch(SUPABASE_URL+"/storage/v1/object/upload/sign/"+INTAKE_BUCKET+"/"+path.split("/").map(encodeURIComponent).join("/"),{method:"POST",headers:{...dbHeaders(),"content-type":"application/json","x-upsert":"true"},body:JSON.stringify({})});
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d.token)throw new Error("Could not create signed storage upload URL ("+r.status+").");
 let uploadUrl=String(d.signedURL||d.signedUrl||d.url||("/object/upload/sign/"+INTAKE_BUCKET+"/"+path+"?token="+encodeURIComponent(d.token)));
 if(!uploadUrl.startsWith("http"))uploadUrl=SUPABASE_URL+"/storage/v1"+(uploadUrl.startsWith("/")?uploadUrl:"/"+uploadUrl);
 return json({ok:true,asset_id:a.id,part_index:part,upload_url:uploadUrl,expected_bytes:Math.min(a.chunk_size,a.total_bytes-part*a.chunk_size),content_type:"application/octet-stream"});
}


function parseMcpPayload(raw:string,contentType:string):any{
 const trimmed=String(raw||"").trim();
 if(!trimmed)return {};
 if(contentType.includes("text/event-stream")||trimmed.startsWith("event:")||trimmed.includes("\ndata:")){
  const messages=trimmed.split(/\r?\n/).filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trim()).filter(Boolean);
  for(let i=messages.length-1;i>=0;i--){try{return JSON.parse(messages[i]);}catch{}}
 }
 try{return JSON.parse(trimmed);}catch{return {text:trimmed.slice(0,5000)};}
}
async function vidiqMcpRpc(apiKey:string,method:string,params:any,id:number,sessionId:string|null,protocolVersion:string){
 const headers:Record<string,string>={authorization:"Bearer "+apiKey,"content-type":"application/json","accept":"application/json, text/event-stream","mcp-protocol-version":protocolVersion};
 if(sessionId)headers["mcp-session-id"]=sessionId;
 const response=await fetch("https://mcp.vidiq.com/mcp",{method:"POST",headers,body:JSON.stringify({jsonrpc:"2.0",id,method,params})});
 const raw=await response.text().catch(()=>"");
 if(!response.ok)throw new Error("vidIQ MCP returned HTTP "+response.status+". Check the server-side API key and MCP access.");
 const payload=parseMcpPayload(raw,response.headers.get("content-type")||"");
 if(payload?.error)throw new Error("vidIQ MCP request failed: "+String(payload.error.message||"Unknown MCP error").slice(0,240));
 return {payload,sessionId:response.headers.get("mcp-session-id")||sessionId};
}
async function vidiqMcpStart(apiKey:string){
 let lastError:unknown=null;
 for(const protocolVersion of ["2025-03-26","2024-11-05"]){
  try{
   const initialized=await vidiqMcpRpc(apiKey,"initialize",{protocolVersion,capabilities:{},clientInfo:{name:"ZOZ Pro",version:"1.0.0"}},1,null,protocolVersion);
   const sessionId=initialized.sessionId;
   const session={sessionId,protocolVersion};
   await vidiqMcpRpc(apiKey,"notifications/initialized",{},0,session.sessionId,protocolVersion).catch(()=>null);
   const tools=await vidiqMcpRpc(apiKey,"tools/list",{cursor:null},2,session.sessionId,protocolVersion);
   const list=tools.payload?.result?.tools||tools.payload?.tools||[];
   if(!Array.isArray(list))throw new Error("vidIQ MCP did not return a tool list.");
   return {sessionId:tools.sessionId,protocolVersion,tools:list};
  }catch(e){lastError=e;}
 }
 throw lastError instanceof Error?lastError:new Error("Could not initialize vidIQ MCP.");
}
function vidiqToolValue(result:any){
 const value=result?.structuredContent??result?.result?.structuredContent;
 if(value!==undefined)return value;
 const blocks=result?.content??result?.result?.content;
 if(Array.isArray(blocks)){
  const textBlock=blocks.find((b:any)=>b?.type==="text"&&typeof b.text==="string");
  if(textBlock){
   try{return JSON.parse(textBlock.text);}catch{return {text:String(textBlock.text).slice(0,12000)};}
  }
 }
 return result?.result??result??{};
}
async function vidiqCallTool(apiKey:string,session:any,name:string,args:any,id:number){
 if(!session.tools.some((t:any)=>t?.name===name))throw new Error("The connected vidIQ MCP account does not expose "+name+".");
 const call=await vidiqMcpRpc(apiKey,"tools/call",{name,arguments:args},id,session.sessionId,session.protocolVersion);
 const result=call.payload?.result??call.payload;
 if(result?.isError)throw new Error("vidIQ tool "+name+" returned an error.");
 return {value:vidiqToolValue(result),sessionId:call.sessionId};
}
function vidiqCredits(value:any):number|null{
 const candidates=[value?.totalCredits,value?.credits?.total,value?.balance?.totalCredits,value?.renewableCredits,value?.remainingCredits];
 for(const candidate of candidates)if(typeof candidate==="number"&&Number.isFinite(candidate))return candidate;
 const textValue=typeof value?.text==="string"?value.text:"";
 const match=textValue.match(/(\d+)\s*(?:credits?|رصيد)/i);
 return match?Number(match[1]):null;
}
const VIDIQ_ACCOUNT_SLOTS=[
 {key:"zoz_hazem",label:"ZOZ Hazem"},
 {key:"hazem_now",label:"Hazem Now"},
 {key:"zoz_manager",label:"ZOZ Manager"}
];
async function vidiqAccountSecret(ownerId:string,accountKey:string){
 const stored=await db("rpc/zoz_vidiq_get_account_secret",{method:"POST",body:JSON.stringify({p_owner_id:ownerId,p_account_key:accountKey})}).catch(()=>null);
 if(typeof stored==="string"&&stored)return stored;
 if(accountKey==="zoz_hazem")return Deno.env.get("VIDIQ_MCP_API_KEY_ZOZ_HAZEM")||VIDIQ_MCP_API_KEY||"";
 return Deno.env.get(accountKey==="hazem_now"?"VIDIQ_MCP_API_KEY_HAZEM_NOW":"VIDIQ_MCP_API_KEY_ZOZ_MANAGER")||"";
}
async function vidiqSaveAccountSecret(ownerId:string,accountKey:string,secret:string){
 return await db("rpc/zoz_vidiq_set_account_secret",{method:"POST",body:JSON.stringify({p_owner_id:ownerId,p_account_key:accountKey,p_secret:secret})});
}
async function vidiqReadAccountBalance(account:any,ownerId:string){
 const apiKey=await vidiqAccountSecret(ownerId,account.key);
 if(!apiKey)return {key:account.key,label:account.label,configured:false,connected:false,status:"needs_api_key",credits_remaining:null};
 try{
  const session=await vidiqMcpStart(apiKey);
  const result=await vidiqCallTool(apiKey,session,"vidiq_balance",{},3);
  const balance=result.value||{};
  const credits=vidiqCredits(balance);
  return {key:account.key,label:account.label,configured:true,connected:credits!==null,status:credits===null?"balance_unavailable":"connected",
   credits_remaining:credits,renewable_credits:typeof balance.renewableCredits==="number"?balance.renewableCredits:null,
   max_renewable_credits:typeof balance.maxRenewableCredits==="number"?balance.maxRenewableCredits:null,
   add_on_credits:typeof balance.addOnCredits==="number"?balance.addOnCredits:null,
   resets_at:balance.renewableResetsAt||null};
 }catch(error){
  return {key:account.key,label:account.label,configured:true,connected:false,status:"connection_error",credits_remaining:null,
   error:(error instanceof Error?error.message:"vidIQ account check failed").slice(0,220)};
 }
}
async function vidiqAccountBalances(){
 return await Promise.all(VIDIQ_ACCOUNT_SLOTS.map(account=>vidiqReadAccountBalance(account)));
}
function chooseVidiqAccount(balances:any[],minimumCredits:number){
 return balances.filter(x=>x.connected&&typeof x.credits_remaining==="number"&&x.credits_remaining>=minimumCredits)
  .sort((a,b)=>b.credits_remaining-a.credits_remaining)[0]||null;
}


async function listManagedChannels(u:any){
 const rows=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&select=id,channel_id,channel_title,display_name,niche,target_audience,default_language,content_tone,channel_goal,content_pillars,content_constraints,monetization_strategy,is_active,connection_status,last_synced_at,updated_at&order=channel_title.asc");
 const credentials=await db("zoz_pro_managed_channel_credentials?owner_id=eq."+encodeURIComponent(u.id)+"&select=channel_id,status,token_expires_at,updated_at");
 const legacy=await db("zoz_pro_youtube_analytics_tokens?owner_id=eq."+encodeURIComponent(u.id)+"&select=channel_id,status,token_expires_at,updated_at");
 const creds=new Map((Array.isArray(credentials)?credentials:[]).map((x:any)=>[String(x.channel_id),x]));
 const old=new Map((Array.isArray(legacy)?legacy:[]).map((x:any)=>[String(x.channel_id),x]));
 return json({ok:true,channels:(Array.isArray(rows)?rows:[]).map((ch:any)=>{const c=creds.get(String(ch.channel_id))||old.get(String(ch.channel_id))||null;return {...ch,has_authorization:!!c&&c.status==="active",credential_status:c?.status||"missing",token_expires_at:c?.token_expires_at||null};})});
}
async function managedChannelConnect(req:Request,u:any){
 const b=await req.json().catch(()=>({})),channelId=String(b.channel_id||"");
 if(!/^UC[A-Za-z0-9_-]{22}$/.test(channelId))return fail("معرّف القناة غير صالح.",400);
 const channels=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=channel_id,channel_title,display_name&limit=1");
 if(!channels?.[0])return fail("هذه القناة غير مسجلة ضمن قنوات المالك في ZOZ Pro.",404);
 if(!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET)return fail("إعداد OAuth في Supabase غير مكتمل؛ لم نبدأ التفويض.",503);
 const rawState=crypto.randomUUID()+"-"+crypto.randomUUID()+".mc."+channelId;
 await db("zoz_pro_youtube_oauth_states",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({state_hash:await sha(rawState),owner_id:u.id,channel_id:channelId,expires_at:new Date(Date.now()+10*60*1000).toISOString()})});
 const p=new URLSearchParams({client_id:GOOGLE_CLIENT_ID,redirect_uri:CALLBACK_URL,response_type:"code",scope:"https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly https://www.googleapis.com/auth/youtube.force-ssl",access_type:"offline",prompt:"consent",include_granted_scopes:"true",state:rawState});
 return json({ok:true,channel_id:channelId,channel_title:channels[0].display_name||channels[0].channel_title,authorization_url:"https://accounts.google.com/o/oauth2/v2/auth?"+p.toString(),expires_in_seconds:600,message:"افتح رابط Google واختر الحساب الذي يدير هذه القناة. سيتحقق رد التفويض من معرّف القناة قبل حفظ أي رمز."});
}
async function refreshManagedChannelToken(saved:any,channelId:string){
 const expiresAt=Date.parse(String(saved.token_expires_at||""));
 if(Number.isFinite(expiresAt)&&expiresAt>Date.now()+90000)return saved;
 if(!saved.refresh_token)throw new Error("انتهت صلاحية الاتصال ولا يوجد refresh token؛ أعد التفويض لهذه القناة.");
 if(!GOOGLE_CLIENT_ID||!GOOGLE_CLIENT_SECRET)throw new Error("إعدادات تجديد Google OAuth غير مكتملة.");
 const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:GOOGLE_CLIENT_ID,client_secret:GOOGLE_CLIENT_SECRET,refresh_token:saved.refresh_token,grant_type:"refresh_token"})});
 const d=await response.json().catch(()=>({}));
 if(!response.ok||!d.access_token)throw new Error("تعذر تجديد اتصال Google لهذه القناة (HTTP "+response.status+"). أعد التفويض من زر القناة.");
 const next={...saved,access_token:d.access_token,refresh_token:d.refresh_token||saved.refresh_token,token_expires_at:new Date(Date.now()+Number(d.expires_in||3600)*1000).toISOString(),updated_at:new Date().toISOString()};
 await db("zoz_pro_managed_channel_credentials?owner_id=eq."+encodeURIComponent(saved.owner_id)+"&channel_id=eq."+encodeURIComponent(channelId),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({access_token:next.access_token,refresh_token:next.refresh_token,token_expires_at:next.token_expires_at,status:"active",updated_at:next.updated_at})});
 if(channelId===CHANNEL_ID)await db("zoz_pro_youtube_analytics_tokens?owner_id=eq."+encodeURIComponent(saved.owner_id)+"&channel_id=eq."+encodeURIComponent(channelId),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({access_token:next.access_token,refresh_token:next.refresh_token,token_expires_at:next.token_expires_at,status:"active",updated_at:next.updated_at})});
 return next;
}
async function getManagedChannelToken(u:any,channelId:string){
 const rows=await db("zoz_pro_managed_channel_credentials?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&status=eq.active&select=owner_id,channel_id,access_token,refresh_token,token_expires_at,scopes,status&limit=1");
 let saved=rows?.[0]||null;
 if(!saved&&channelId===CHANNEL_ID){
  const legacy=await db("zoz_pro_youtube_analytics_tokens?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&status=eq.active&select=owner_id,channel_id,access_token,refresh_token,token_expires_at,scopes,status&limit=1");
  saved=legacy?.[0]||null;
  if(saved)await db("zoz_pro_managed_channel_credentials?on_conflict=owner_id,channel_id",{method:"POST",headers:{prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(saved)});
 }
 if(!saved)throw new Error("هذه القناة غير مفوضة بعد. اضغط «ربط Google لهذه القناة» ثم وافق من حساب Google الذي يديرها.");
 const required=["https://www.googleapis.com/auth/youtube.readonly","https://www.googleapis.com/auth/yt-analytics.readonly","https://www.googleapis.com/auth/youtube.force-ssl"];
 if(!Array.isArray(saved.scopes)||!required.every((s:string)=>saved.scopes.includes(s)))throw new Error("التفويض الحالي لا يتضمن صلاحيات قراءة التحليلات وإدارة الفيديو اللازمة؛ أعد الربط ووافق على الصلاحيات المطلوبة.");
 return await refreshManagedChannelToken(saved,channelId);
}
async function managedChannelSync(req:Request,u:any){
 const b=await req.json().catch(()=>({})),channelId=String(b.channel_id||"");
 if(!/^UC[A-Za-z0-9_-]{22}$/.test(channelId))return fail("معرّف القناة غير صالح.",400);
 const known=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=channel_id,channel_title,display_name,connection_status&limit=1");
 if(!known?.[0])return fail("القناة غير مسجلة لهذا المالك في ZOZ Pro.",404);
 try{
  const token=await getManagedChannelToken(u,channelId),access=token.access_token;
  const callGoogle=async(url:string)=>{const r=await fetch(url,{headers:{authorization:"Bearer "+access}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error("Google API HTTP "+r.status+": "+String(d?.error?.message||"تعذر قراءة البيانات.").slice(0,180));return d;};
  let channel:any=null;
  const qch=new URLSearchParams({part:"id,snippet,contentDetails,statistics",mine:"true",maxResults:"50"});
  const chd=await callGoogle("https://www.googleapis.com/youtube/v3/channels?"+qch.toString());
  channel=(chd.items||[]).find((x:any)=>x.id===channelId)||null;
  if(!channel)throw new Error("الحساب المختار لا يدير معرّف القناة المطلوب. لم تُقرأ بيانات قناة أخرى.");
  const end=String(b.end_date||new Date(Date.now()-86400000).toISOString().slice(0,10));
  const start=String(b.start_date||new Date(Date.parse(end+"T00:00:00Z")-27*86400000).toISOString().slice(0,10));
  if(!validDate(start)||!validDate(end)||start>end)throw new Error("فترة التحليل غير صالحة.");
  const report=async(params:Record<string,string>)=>{const q=new URLSearchParams({ids:"channel==MINE",startDate:start,endDate:end,...params});const r=await fetch("https://youtubeanalytics.googleapis.com/v2/reports?"+q.toString(),{headers:{authorization:"Bearer "+access}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error("YouTube Analytics HTTP "+r.status+": "+String(d?.error?.message||"تعذر قراءة التحليلات.").slice(0,180));return d;};
  const [summary,daily,traffic]=await Promise.all([report({metrics:"views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments"}),report({metrics:"views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost",dimensions:"day",sort:"day"}),report({metrics:"views,estimatedMinutesWatched",dimensions:"insightTrafficSourceType",sort:"-views"})]);
  const objectRows=(d:any)=>{const headers=(d.columnHeaders||[]).map((x:any)=>String(x.name));return (d.rows||[]).map((row:any)=>Object.fromEntries(headers.map((h:string,i:number)=>[h,row[i]])));};
  const summaryRow=objectRows(summary)[0]||{};
  const metrics={views:Number(summaryRow.views||0),watch_time_minutes:Number(summaryRow.estimatedMinutesWatched||0),watch_time_hours:Number(summaryRow.estimatedMinutesWatched||0)/60,average_view_duration_seconds:Number(summaryRow.averageViewDuration||0),subscribers_gained:Number(summaryRow.subscribersGained||0),subscribers_lost:Number(summaryRow.subscribersLost||0),subscribers_net:Number(summaryRow.subscribersGained||0)-Number(summaryRow.subscribersLost||0),likes:Number(summaryRow.likes||0),comments:Number(summaryRow.comments||0)};
  const dailyRows=objectRows(daily),trafficRows=objectRows(traffic),uploadsId=channel.contentDetails?.relatedPlaylists?.uploads;
  let playlistItems:any[]=[];
  if(uploadsId){let next="";for(let page=0;page<3;page++){const q=new URLSearchParams({part:"snippet,contentDetails",playlistId:String(uploadsId),maxResults:"50"});if(next)q.set("pageToken",next);const d=await callGoogle("https://www.googleapis.com/youtube/v3/playlistItems?"+q.toString());playlistItems.push(...(d.items||[]));next=String(d.nextPageToken||"");if(!next)break;}}
  const videoIds=[...new Set(playlistItems.map((x:any)=>String(x.contentDetails?.videoId||x.snippet?.resourceId?.videoId||"")).filter((x:string)=>/^[A-Za-z0-9_-]{11}$/.test(x)))].slice(0,150);
  let videos:any[]=[];
  for(let i=0;i<videoIds.length;i+=50){const q=new URLSearchParams({part:"snippet,status,statistics,contentDetails,processingDetails",id:videoIds.slice(i,i+50).join(","),maxResults:String(Math.min(50,videoIds.length-i))});const d=await callGoogle("https://www.googleapis.com/youtube/v3/videos?"+q.toString());videos.push(...(d.items||[]).filter((v:any)=>v.snippet?.channelId===channelId).map((v:any)=>({video_id:v.id,title:v.snippet?.title||"",published_at:v.snippet?.publishedAt||null,privacy_status:v.status?.privacyStatus||null,upload_status:v.status?.uploadStatus||null,processing_status:v.processingDetails?.processingStatus||null,views:Number(v.statistics?.viewCount||0),likes:Number(v.statistics?.likeCount||0),comments:Number(v.statistics?.commentCount||0),duration:v.contentDetails?.duration||null,thumbnail_url:v.snippet?.thumbnails?.high?.url||v.snippet?.thumbnails?.default?.url||null,tags:v.snippet?.tags||[]})));}
  const day=new Date().toISOString().slice(0,10);
  const savedRows=await db("zoz_pro_managed_channel_snapshots?on_conflict=owner_id,channel_id,start_date,end_date,snapshot_day",{method:"POST",headers:{prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify([{owner_id:u.id,channel_id:channelId,start_date:start,end_date:end,snapshot_day:day,metrics,daily_metrics:dailyRows,traffic_sources_daily:trafficRows,video_count:videos.length,analytics_video_count:videos.length,source:"youtube-analytics-api",updated_at:new Date().toISOString()}])});
  const snapshot=savedRows?.[0];if(!snapshot?.id)throw new Error("قُرئت البيانات لكن تعذر حفظ لقطة التحليل في قاعدة القناة.");
  await db("zoz_pro_managed_channel_video_snapshots?snapshot_id=eq."+encodeURIComponent(snapshot.id),{method:"DELETE",headers:{prefer:"return=minimal"}});
  if(videos.length)await db("zoz_pro_managed_channel_video_snapshots",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify(videos.map((v:any)=>({snapshot_id:snapshot.id,owner_id:u.id,channel_id:channelId,video_id:v.video_id,video_title:v.title,published_at:v.published_at,privacy_status:v.privacy_status,metrics:{views:v.views,likes:v.likes,comments:v.comments,upload_status:v.upload_status,processing_status:v.processing_status,duration:v.duration,thumbnail_url:v.thumbnail_url,tags:v.tags}})))});
  const capturedAt=new Date().toISOString();
  await db("zoz_pro_managed_channel_live_status?on_conflict=owner_id,channel_id",{method:"POST",headers:{prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({owner_id:u.id,channel_id:channelId,channel_title:channel.snippet?.title||known[0].channel_title,channel_statistics:channel.statistics||{},recent_videos:videos.slice(0,15),source:"youtube-data-api",captured_at:capturedAt,last_attempt_at:capturedAt,last_error:null})});
  await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({channel_title:channel.snippet?.title||known[0].channel_title,connection_status:"connected",last_synced_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
  return json({ok:true,channel_id:channelId,channel_title:channel.snippet?.title||known[0].channel_title,snapshot_id:snapshot.id,period:{start_date:start,end_date:end},metrics,daily:dailyRows,traffic_sources:trafficRows,videos:videos.sort((a:any,b:any)=>String(b.published_at||"").localeCompare(String(a.published_at||""))),synced_at:new Date().toISOString(),message:"تمت قراءة YouTube Analytics وبيانات الفيديوهات مباشرة وحفظ لقطة مستقلة لهذه القناة."});
 }catch(e){const msg=e instanceof Error?e.message:"تعذر مزامنة القناة.";if(msg.includes("لا يدير معرّف القناة")||msg.includes("تعذر تجديد")||msg.includes("لا يوجد refresh token")||msg.includes("غير مفوضة")){await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({connection_status:"needs_reconnect",updated_at:new Date().toISOString()})});}return fail(msg,502);}
}

function newsXml(v:string){return String(v||"").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1").replace(/<[^>]+>/g," ").replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/\s+/g," ").trim();}
function newsField(xml:string,tag:string){const m=xml.match(new RegExp("<"+tag+"\\b[^>]*>([\\s\\S]*?)</"+tag+">","i"));return m?newsXml(m[1]):"";}
async function managedPoliticalNews(req:Request,u:any){
 const b=await req.json().catch(()=>({})),cid=String(b.channel_id||POLITICAL_CHANNEL_ID);if(cid!==POLITICAL_CHANNEL_ID)return fail("بحث الأخبار السياسية متاح للقناة السياسية فقط.",403);
 const known=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=channel_id,display_name,niche&limit=1");if(!known?.[0])return fail("القناة السياسية غير مسجلة.",404);if(String(known[0].niche||"").includes("وجهة القناة قيد التحقق"))return fail("تم تعليق اكتشاف الأخبار السياسية لهذه القناة لأن اسم YouTube الفعلي هو «فكره كيدز»؛ أكّد وجهة القناة أولًا.",409);
 const feeds=[{name:"BBC Arabic Middle East",url:"https://feeds.bbci.co.uk/arabic/middleeast/rss.xml"},{name:"BBC Arabic World",url:"https://feeds.bbci.co.uk/arabic/world/rss.xml"},{name:"Google News Egypt Politics",url:"https://news.google.com/rss/search?q=Egypt%20politics%20when%3A7d&hl=en-US&gl=US&ceid=US:en"},{name:"Google News Arabic Politics",url:"https://news.google.com/rss/search?q=%D8%A7%D9%84%D8%B3%D9%8A%D8%A7%D8%B3%D8%A9%20%D9%85%D8%B5%D8%B1%20when%3A7d&hl=ar&gl=EG&ceid=EG:ar"},{name:"Google News World Politics",url:"https://news.google.com/rss/search?q=world%20politics%20when%3A7d&hl=en-US&gl=US&ceid=US:en"}];
 const results=await Promise.all(feeds.map(async f=>{try{const r=await fetch(f.url,{headers:{"user-agent":"ZOZPro-NewsResearch/1.0"},signal:AbortSignal.timeout(6500)});if(!r.ok)throw new Error("HTTP "+r.status);const xml=await r.text(),blocks=[...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m=>m[0]),items:any[]=[];for(const block of blocks){const title=newsField(block,"title"),url=newsField(block,"link"),pub=newsField(block,"pubDate"),summary=newsField(block,"description");if(!title||!/^https:\/\//i.test(url))continue;const dt=pub?new Date(pub):null;if(dt&&Number.isFinite(dt.getTime())&&dt.getTime()<Date.now()-10*86400000)continue;items.push({title,url,published_at:dt&&Number.isFinite(dt.getTime())?dt.toISOString():null,summary:summary.slice(0,1400),feed_url:f.url,source_name:f.name});if(items.length>=10)break;}return {source:f.name,ok:true,count:items.length,items};}catch(e){return {source:f.name,ok:false,count:0,items:[],error:e instanceof Error?e.message:"feed failed"};}}));
 const all:any[]=[],seen=new Set<string>();for(const r of results)for(const x of r.items){const k=x.url.split("#")[0];if(!seen.has(k)){seen.add(k);all.push({...x,url:k});}}all.sort((a,b)=>String(b.published_at||"").localeCompare(String(a.published_at||"")));
 const old=await db("zoz_pro_managed_channel_recommendations?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=id,evidence&order=updated_at.desc&limit=300"),oldUrls=new Set((Array.isArray(old)?old:[]).filter((x:any)=>x.evidence?.category==="political_news").map((x:any)=>String(x.evidence?.source_url||"")));
 const fresh=all.filter(x=>!oldUrls.has(x.url)).slice(0,25),now=new Date().toISOString();if(fresh.length){const rows=[];for(const x of fresh)rows.push({owner_id:u.id,channel_id:cid,recommendation_key:"political-news-"+(await sha(x.url)).slice(0,24),recommendation_type:"topic_test",title:x.title.slice(0,240),body:x.summary||"افتح المصدر الأصلي قبل الاعتماد.",evidence:{category:"political_news",source_url:x.url,source_name:x.source_name,published_at:x.published_at,feed_url:x.feed_url,summary:x.summary,verification_status:"needs_editor_review",editor_verified_by_owner:false,independent_sources:[],discovered_at:now},status:"draft",updated_at:now});await db("zoz_pro_managed_channel_recommendations",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify(rows)});}
 const stored=await db("zoz_pro_managed_channel_recommendations?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=id,title,body,evidence,status,updated_at&order=updated_at.desc&limit=300"),items=(Array.isArray(stored)?stored:[]).filter((x:any)=>x.evidence?.category==="political_news").sort((a:any,b:any)=>String(b.evidence?.published_at||"").localeCompare(String(a.evidence?.published_at||""))).slice(0,50);
 return json({ok:true,channel_id:cid,checked_at:now,feed_status:results.map((x:any)=>({source:x.source,ok:x.ok,count:x.count,error:x.error||null})),discovered_count:all.length,saved_new_count:fresh.length,items,notice:"موجز RSS للاكتشاف فقط، وليس إثباتًا لصحة الخبر. يلزم فتح المصدر الأصلي ومصدر مستقل آخر."});
}
async function managedPoliticalNewsList(req:Request,u:any){const b=await req.json().catch(()=>({})),cid=String(b.channel_id||POLITICAL_CHANNEL_ID);if(cid!==POLITICAL_CHANNEL_ID)return fail("قناة الأخبار غير صحيحة.",403);const rows=await db("zoz_pro_managed_channel_recommendations?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=id,title,body,evidence,status,updated_at&order=updated_at.desc&limit=300");return json({ok:true,channel_id:cid,items:(Array.isArray(rows)?rows:[]).filter((x:any)=>x.evidence?.category==="political_news").slice(0,50)});}
async function managedPoliticalNewsReview(req:Request,u:any){
 const b=await req.json().catch(()=>({})),cid=String(b.channel_id||POLITICAL_CHANNEL_ID),id=String(b.recommendation_id||""),decision=String(b.decision||"");if(cid!==POLITICAL_CHANNEL_ID)return fail("هذه المراجعة تخص القناة السياسية فقط.",403);
 const rows=await db("zoz_pro_managed_channel_recommendations?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=id,title,evidence,status&limit=1"),item=rows?.[0];if(!item||item.evidence?.category!=="political_news")return fail("الخبر غير موجود في القناة السياسية.",404);
 if(decision==="reject"){const evidence={...item.evidence,verification_status:"rejected_by_owner",editor_verified_by_owner:false,verification_notes:intakeText(b.notes,2000),reviewed_at:new Date().toISOString()};await db("zoz_pro_managed_channel_recommendations?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"dismissed",evidence,updated_at:new Date().toISOString()})});return json({ok:true,status:"dismissed"});}
 if(decision!=="verify")return fail("قرار المراجعة غير صالح.",400);
 const urls=Array.isArray(b.source_urls)?b.source_urls.map((x:any)=>String(x||"").trim()).filter(Boolean):[],valid:string[]=[],hosts=new Set<string>(),allowed=["reuters.com","apnews.com","bbc.co.uk","bbc.com","aljazeera.net","aljazeera.com","ahram.org.eg","sis.gov.eg","presidency.eg","cabinet.gov.eg","un.org","consilium.europa.eu","state.gov","whitehouse.gov","gov.uk","dw.com","france24.com","theguardian.com","ft.com","nytimes.com","washingtonpost.com","afp.com","egypttoday.com","youm7.com","cairo24.com","almasryalyoum.com","madamasr.com","bloomberg.com"];
 for(const value of urls){try{const url=new URL(value),host=url.hostname.toLowerCase().replace(/^www\./,"");if(url.protocol!=="https:"||!allowed.some(root=>host===root||host.endsWith("."+root)))return fail("أحد الروابط ليس من نطاق HTTPS موثوق مدرج.",400);if(!hosts.has(host)){hosts.add(host);valid.push(url.toString());}}catch{return fail("رابط مصدر غير صالح.",400);}}
 const notes=intakeText(b.notes,2000);if(valid.length<2)return fail("أدخل مصدرين مستقلين من نطاقين مختلفين على الأقل.",422);if(notes.length<20)return fail("اكتب ملخصًا يحدد الوقائع المؤكدة وما لم يتأكد (20 حرفًا على الأقل).",422);
 const evidence={...item.evidence,verification_status:"editor_verified_by_owner",editor_verified_by_owner:true,independent_sources:valid,verification_notes:notes,reviewed_at:new Date().toISOString()};await db("zoz_pro_managed_channel_recommendations?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"approved",evidence,updated_at:new Date().toISOString()})});return json({ok:true,status:"approved",recommendation_id:id,independent_sources:valid,message:"تم حفظ اعتماد المالك ومصادره. لا يعني ذلك أن النظام تحقق آليًا من كل ادعاء."});
}
async function configuredScriptDraft(input:any):Promise<{draft:any,engine:string}|null>{
 const prompt="اكتب سكربت عربي احترافي لفيديو يوتيوب وفق بيانات القناة والموضوع. لا تخترع حقائق أو مصادر أو نتائج. أعد JSON فقط بالمفاتيح title,hook,narration,shot_plan,cta,description,tags. للقناة السياسية التزم فقط بالوقائع في المصادر المرفقة واذكر ما لم يتأكد.\n"+JSON.stringify(input);
 const claudeKey=Deno.env.get("ANTHROPIC_API_KEY")||Deno.env.get("CLAUDE_API_KEY")||"";
 const parse=(s:string)=>{const clean=s.trim().replace(/^\x60{3}(?:json)?/i,"").replace(/\x60{3}$/,"").trim();const a=clean.indexOf("{"),z=clean.lastIndexOf("}");if(a<0||z<=a)throw new Error("AI response not JSON");return JSON.parse(clean.slice(a,z+1));};
 if(claudeKey&&Deno.env.get("CLAUDE_API_ENABLED")==="true"){try{const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":claudeKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:2600,messages:[{role:"user",content:prompt}]})});const d=await r.json().catch(()=>({}));if(r.ok){const t=String((d.content||[]).filter((x:any)=>x.type==="text").map((x:any)=>x.text).join("\n"));return {draft:parse(t),engine:"claude-api"};}}catch{}}
 // Key order: production account first, then independent projects. Only secret names/slot labels are recorded; key values never leave server memory.
 const slots=[
  {name:"zoz_pro_primary",key:Deno.env.get("GEMINI_API_KEY")||"",project_group:"gen-lang-client-0377789741"},
  {name:"zoz_now",key:Deno.env.get("GEMINI_API_KEY_ZOZ_NOW")||"",project_group:"gen-lang-client-0718749828"},
  {name:"zoz_manager",key:Deno.env.get("GEMINI_API_KEY_ZOZ_MANAGER")||"",project_group:"user-configured-project"},
  {name:"zoz_hazem",key:Deno.env.get("GEMINI_API_KEY_ZOZ_HAZEM")||"",project_group:"user-configured-project"}
 ];
 const seen=new Set<string>();
 for(const slot of slots){
  if(!slot.key||seen.has(slot.key))continue;
  seen.add(slot.key);
  try{
   const r=await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key="+encodeURIComponent(slot.key),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json",temperature:0.65,maxOutputTokens:2600}})});
   const d=await r.json().catch(()=>({}));
   if(r.ok){
    const t=String(d.candidates?.[0]?.content?.parts?.map((x:any)=>x.text||"").join("\n")||"");
    try{return {draft:parse(t),engine:"gemini-api:"+slot.name};}catch{continue;}
   }
   // Continue to the next configured project on disabled/invalid keys, rate limits, exhausted free quota, or transient server errors.
   if([400,401,403,404,429,500,502,503,504].includes(r.status))continue;
  }catch{continue;}
 }
 return null;
}
async function managedContentStudio(req:Request,u:any){
 const b=await req.json().catch(()=>({})),cid=String(b.channel_id||CHANNEL_ID),channels=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=channel_id,channel_title,display_name,niche,target_audience,content_tone,content_pillars&limit=1"),ch=channels?.[0];if(!ch)return fail("القناة غير مسجلة لهذا المالك.",404);if(cid===CHANNEL_ID)return await localContentStudio(new Request(req.url,{method:"POST",headers:req.headers,body:JSON.stringify(b)}),u);
 let news:any=null;if(cid===POLITICAL_CHANNEL_ID){const id=String(b.news_item_id||"");if(!id)return fail("اختر خبرًا تمت مراجعته واعتماده بمصدرين مستقلين.",422);const rows=await db("zoz_pro_managed_channel_recommendations?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&status=eq.approved&select=id,title,evidence&limit=1");news=rows?.[0];if(!news||news.evidence?.category!=="political_news"||news.evidence?.editor_verified_by_owner!==true||!Array.isArray(news.evidence?.independent_sources)||news.evidence.independent_sources.length<2)return fail("الخبر لم يجتز المراجعة التحريرية المطلوبة.",422);}
 const topic=intakeText(b.topic||news?.title,240);if(!topic)return fail("أدخل موضوعًا للمسودة.",400);const snaps=await db("zoz_pro_managed_channel_snapshots?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=id,start_date,end_date,snapshot_day&order=created_at.desc&limit=1"),snap=snaps?.[0]||null;
 const videos=snap?await db("zoz_pro_managed_channel_video_snapshots?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&snapshot_id=eq."+encodeURIComponent(snap.id)+"&select=video_id,video_title,metrics,privacy_status&order=created_at.desc&limit=500"):[],publicVideos=(Array.isArray(videos)?videos:[]).filter((v:any)=>v.privacy_status==="public"||v.privacy_status==="unlisted").map((v:any)=>({id:v.video_id,title:v.video_title,views:Number(v.metrics?.views||0),privacy:v.privacy_status})).sort((a:any,b:any)=>b.views-a.views);
 const political=cid===POLITICAL_CHANNEL_ID,fekra=cid===FEKRA_CHANNEL_ID,duration=Math.max(20,Math.min(180,Number(b.duration_seconds)||45)),hook=political?"ماذا نعرف حتى الآن، وما الذي لم يتأكد بعد؟":fekra?"قبل ما تعتمد على الفكرة دي، خلّينا نختبرها عمليًا.":"خلّينا نفهم الفكرة من دليل واضح ومصدر موثوق.";
 const outline=political?["حدّد تاريخ الخبر والجهة التي أعلنت عنه.","اعرض الوقائع التي يدعمها المصدر الأصلي.","قارن المصدرين المستقلين وحدد نقاط الاتفاق والاختلاف.","اذكر بوضوح ما لم يتأكد دون توقعات أو تحريض."]:fekra?["ابدأ بمشكلة أو هدف ملموس في أول ثوانٍ.","نفّذ تجربة أو سير عمل حقيقيًا وأظهر النتيجة.","اشرح الفائدة والقيود وتحقق من الأسعار والحدود الحالية.","اختم بخلاصة قابلة للتطبيق وسؤال للجمهور."]:["ابدأ بسؤال محدد يشد الانتباه.","اعرض مثالًا بصريًا ومصدرًا موثوقًا.","اشرح الدليل وافصل بين الحقيقة والتفسير.","اختم بخلاصة وسؤال مفيد."],sourceUrls=political?[String(news.evidence.source_url||""),...(news.evidence.independent_sources||[])].filter(Boolean):[],cta=political?"اكتب سؤالك حول الخبر وسنوضح ما تثبته المصادر.":"ما الفكرة التي تريد اختبارها في الحلقة التالية؟",title=(political?"ماذا نعرف عن: ":fekra?"اختبار عملي: ":"")+topic,tags=political?["أخبار مصر","أخبار العالم","سياسة","تدقيق الأخبار"]:["الذكاء الاصطناعي","أفكار مفيدة","معلومات موثوقة","أدوات رقمية","إنتاجية"];
 const description="القناة: "+ch.display_name+"\nالمجال: "+ch.niche+"\n\n"+(political?"راجع كل واقعة مقابل المصدر الأصلي والمصادر المستقلة؛ افصل الخبر عن التصريح والتحليل.":"تحقق من المعلومة أو الأداة والأسعار والحدود قبل النشر.")+"\n\n"+(sourceUrls.length?"مصادر المراجعة:\n"+sourceUrls.join("\n")+"\n\n":"")+cta,narration=[{time:"0–4 ث",text:hook},...outline.map((text:string,i:number)=>({time:Math.round(4+i*(duration-11)/outline.length)+"–"+Math.round(4+(i+1)*(duration-11)/outline.length)+" ث",text})),{time:(duration-7)+"–"+duration+" ث",text:cta}],shots=political?[{time:"0–4 ث",visual:"عنوان محايد وتاريخ التحقق",note:"لا تستخدم صورًا مولدة كأنها توثق حدثًا حقيقيًا"},{time:"4–15 ث",visual:"بيان أو وثيقة أصلية",note:"تحقق من النص والتاريخ"},{time:"15–35 ث",visual:"خط زمني ومصادر منفصلة",note:"ميّز بين الروايات"},{time:"الخاتمة",visual:"ما تأكد وما بقي غير مؤكد",note:"اذكر مصادر المتابعة"}]:[{time:"0–4 ث",visual:"سؤال أو نتيجة واضحة",note:"ابدأ مباشرة"},{time:"4–15 ث",visual:"مثال أو تجربة فعلية",note:"لا تختلق نتائج"},{time:"15–35 ث",visual:"شرح بصري مختصر",note:"أثبت الفائدة والقيود"},{time:"الخاتمة",visual:"خلاصة وسؤال",note:"تجنب الوعود المضمونة"}];
 const evidence={channel_id:cid,snapshot_id:snap?.id||null,public_video_count:publicVideos.length,top_video:publicVideos[0]||null,analytics_basis:publicVideos.length?"latest channel-scoped snapshot":"no public-video baseline; editorial choice only",news_item_id:news?.id||null,source_urls:sourceUrls,editor_verified_by_owner:political?true:null,fact_check_required:political,owner_approval_required:true},pkg={channel_id:cid,channel_name:ch.display_name,niche:ch.niche,target_audience:ch.target_audience,format:String(b.mode||"short")==="long"?"YouTube video":"YouTube Short",duration_seconds:duration,hook,narration,shot_plan:shots,cta,title,description,tags,source_reference:sourceUrls.join("\n"),news_item_id:news?.id||null,source_check_required:political,owner_approval_required:true,analytics_basis:evidence},now=new Date().toISOString();
 let aiEngine="local-template";
 const ai=await configuredScriptDraft({channel_name:ch.display_name,niche:ch.niche,audience:ch.target_audience,topic,title,format:pkg.format,duration_seconds:duration,initial_hook:hook,initial_outline:narration,shot_plan:shots,source_urls:sourceUrls,verified_only:political,analytics_baseline:evidence});
 if(ai&&ai.draft&&typeof ai.draft==="object"){const d=ai.draft;aiEngine=ai.engine;if(typeof d.title==="string"&&d.title.trim())pkg.title=d.title.trim().slice(0,100);if(typeof d.hook==="string"&&d.hook.trim())pkg.hook=d.hook.trim().slice(0,700);if(Array.isArray(d.narration)&&d.narration.length)pkg.narration=d.narration.slice(0,24);if(Array.isArray(d.shot_plan)&&d.shot_plan.length)pkg.shot_plan=d.shot_plan.slice(0,20);if(typeof d.cta==="string"&&d.cta.trim())pkg.cta=d.cta.trim().slice(0,500);if(typeof d.description==="string"&&d.description.trim())pkg.description=d.description.slice(0,5000);if(Array.isArray(d.tags)&&d.tags.length)pkg.tags=d.tags.map((x:any)=>intakeText(x,100)).filter(Boolean).slice(0,20);}
 const finalEvidence={...evidence,script_engine:aiEngine,ai_fallback_used:aiEngine==="local-template"};
 const saved=await db("zoz_pro_content_scripts",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({owner_id:u.id,channel_id:cid,snapshot_id:snap?.id||null,recommendation_id:news?.id||null,calendar_id:null,topic,title:pkg.title||title,description:pkg.description||description,tags:pkg.tags||tags,hook:pkg.hook||hook,narration:pkg.narration||narration,shot_plan:pkg.shot_plan||shots,cta:pkg.cta||cta,evidence:finalEvidence,production_package:pkg,generation_method:aiEngine,status:"draft",created_at:now,updated_at:now})});if(!saved?.[0])throw new Error("تعذر حفظ المسودة المستقلة للقناة.");return json({ok:true,channel_id:cid,channel_title:ch.display_name,script:saved[0],analytics_winner:publicVideos[0]||null,message:"حُفظت المسودة في القناة المختارة فقط، ولا يوجد نشر تلقائي."});
}
async function managedChannelCalendar(req:Request,u:any,generate:boolean){
 const b=await req.json().catch(()=>({})),cid=String(b.channel_id||CHANNEL_ID),channels=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=channel_id,display_name,niche&limit=1"),ch=channels?.[0];if(!ch)return fail("القناة غير مسجلة.",404);
 const existing=await db("zoz_pro_managed_channel_content_calendar?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=id,planned_date,sequence_no,format,content_pillar,working_title,hook,outline,cta,evidence,status,production_package&order=planned_date.asc,sequence_no.asc&limit=100");if(!generate||Array.isArray(existing)&&existing.length)return json({ok:true,channel_id:cid,created:false,calendar:existing||[],message:"تم تحميل التقويم دون الكتابة فوق السجلات السابقة."});if(cid===POLITICAL_CHANNEL_ID&&String(ch.niche||"").includes("وجهة القناة قيد التحقق"))return fail("تم تعليق توليد المحتوى لهذه القناة حتى يؤكد المالك وجهتها الصحيحة.",409);
 const topics=cid===FEKRA_CHANNEL_ID?[["اختبر إجابة AI بمصدر مستقل","تدقيق AI"],["3 استخدامات عملية لأداة AI","أدوات الذكاء الاصطناعي"],["هل الخطة مجانية حقًا؟","تكلفة الأدوات"],["فكرة توفر وقتًا في العمل","الإنتاجية"],["اختبار قبل وبعد لصياغة أمر","مقارنة عملية"],["معلومة منتشرة عن AI: ما الدليل؟","تدقيق معلومات"],["من فكرة إلى فيديو بخطوات عملية","صناعة المحتوى"]]:cid===POLITICAL_CHANNEL_ID?[["كيف نتحقق من خبر عاجل؟","تدقيق الأخبار"],["البيان الرسمي مقابل التحليل","ثقافة إعلامية"],["كيف نقرأ قرارًا حكوميًا؟","شرح السياسات"],["كيف نتابع تطورًا دوليًا؟","السياسة الدولية"],["3 أسئلة قبل مشاركة تصريح سياسي","مكافحة التضليل"],["معنى مصطلح سياسي شائع","شرح السياسة"],["كيف نفرق الخبر من التوقع؟","ثقافة إعلامية"]]:[["لغز أثري من مصدر موثق","أسرار الفن المصري"],["كيف نعرف الحياة اليومية في مصر القديمة؟","الحياة اليومية"],["ما الذي نعرفه عن الحرفيين؟","الحياة اليومية"],["كيف نقرأ مشهدًا أثريًا؟","الفن المصري القديم"],["حقيقة شائعة عن الفراعنة: ما الدليل؟","التحقق التاريخي"],["قطعة صغيرة تكشف سياقًا تاريخيًا","القطع الأثرية"],["وراء الأثر: ماذا يخبرنا؟","الآثار"]];
 const snaps=await db("zoz_pro_managed_channel_snapshots?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=id&order=created_at.desc&limit=1"),snapshotId=snaps?.[0]?.id||null,rows:any[]=[];
 for(let i=0;i<7;i++){const topic=topics[i],title=topic[0],pillar=topic[1],outline=cid===POLITICAL_CHANNEL_ID?["تحقق من التاريخ والجهة صاحبة الخبر.","ارجع إلى المصدر الأصلي ووثيقة أو تصريح مباشر.","قارن مصدرين مستقلين ولا تخفِ الاختلاف.","اذكر ما لم يتأكد؛ لا تنشر قبل مراجعة القصة."]:["ابدأ بمثال عملي واضح.","اعرض الدليل أو التجربة ومصدرها.","وضح القيود وما يحتاج تحققًا.","اختم بخلاصة وسؤال للجمهور."],hook=cid===POLITICAL_CHANNEL_ID?"ماذا نعرف فعلاً، وما الذي لم يتأكد؟":"خلّينا نختبر الفكرة عمليًا.",cta="اكتب سؤالك أو اقتراحك للحلقة التالية.",date=new Date(Date.now()+i*86400000).toISOString().slice(0,10),pkg={channel_id:cid,channel_name:ch.display_name,title,format:"YouTube Short",duration_seconds:45,hook,outline,cta,owner_approval_required:true};rows.push({owner_id:u.id,channel_id:cid,snapshot_id:snapshotId,planned_date:date,sequence_no:i+1,format:"short",content_pillar:pillar,working_title:title,hook,outline,cta,evidence:{channel_id:cid,editor_verification_required:cid===POLITICAL_CHANNEL_ID},source_video_id:null,status:"draft",production_package:pkg});}
 const saved=await db("zoz_pro_managed_channel_content_calendar",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify(rows)});if(!Array.isArray(saved)||saved.length!==7)throw new Error("تعذر حفظ الخطة الأسبوعية كاملة.");return json({ok:true,channel_id:cid,created:true,calendar:saved,message:"خطة أسبوعية منفصلة محفوظة؛ أفكار السياسة غير المعتمدة ليست أخبارًا للنشر."});
}
async function managedChannelUpdateVideo(req:Request,u:any){const b=await req.json().catch(()=>({})),cid=String(b.channel_id||""),id=String(b.video_id||"");if(b.confirm_update!==true)return fail("تأكيد المالك مطلوب.",400);const known=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=channel_id&limit=1");if(!known?.[0])return fail("القناة غير مسجلة.",404);const token=await getManagedChannelToken(u,cid),video=await verifyManagedVideo(id,token.access_token,cid),old=video.snippet||{},title=typeof b.title==="string"?b.title.trim():String(old.title||""),description=typeof b.description==="string"?b.description:String(old.description||"");if(!title||title.length>100)return fail("العنوان مطلوب وبحد أقصى 100 حرف.",400);if(new TextEncoder().encode(description).length>5000)return fail("الوصف طويل جدًا.",400);const tags=Array.isArray(b.tags)?b.tags.map((x:any)=>intakeText(x,100)).filter(Boolean).slice(0,30):(Array.isArray(old.tags)?old.tags:[]),snippet={title,description,tags,categoryId:String(old.categoryId||"22"),defaultLanguage:"ar",defaultAudioLanguage:"ar"},result=await youtubeJson("https://www.googleapis.com/youtube/v3/videos?part=snippet",token.access_token,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({id,snippet})});return json({ok:true,channel_id:cid,video_id:id,title:result.snippet?.title||title});}
async function managedChannelSetPrivacy(req:Request,u:any){const b=await req.json().catch(()=>({})),cid=String(b.channel_id||""),id=String(b.video_id||""),privacy=String(b.privacy_status||"");if(b.confirm_update!==true)return fail("تأكيد المالك مطلوب.",400);if(!["public","unlisted","private"].includes(privacy))return fail("الخصوصية غير صالحة.",400);const known=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=channel_id&limit=1");if(!known?.[0])return fail("القناة غير مسجلة.",404);const token=await getManagedChannelToken(u,cid),video=await verifyManagedVideo(id,token.access_token,cid),status={...(video.status||{}),privacyStatus:privacy};await youtubeJson("https://www.googleapis.com/youtube/v3/videos?part=status",token.access_token,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({id,status})});return json({ok:true,channel_id:cid,video_id:id,privacy_status:privacy});}

async function localContentStudio(req:Request,u:any){
 const body=await req.json().catch(()=>({}));
 if(String(body.channel_id||CHANNEL_ID)!==CHANNEL_ID)return await managedContentStudio(new Request(req.url,{method:"POST",headers:req.headers,body:JSON.stringify(body)}),u);
 const topic=intakeText(body.topic,240);if(!topic)return fail("أدخل موضوع الفيديو أولًا.",400);
 const mode=String(body.mode||"short")==="long"?"long":"short",duration=Math.max(20,Math.min(180,Number(body.duration_seconds)||40));
 const snapshots=await db("zoz_pro_youtube_analytics_snapshots?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(CHANNEL_ID)+"&select=id,snapshot_day,start_date,end_date,created_at&order=created_at.desc&limit=20");
 const snapList=Array.isArray(snapshots)?snapshots:[];let snapshotId=String(body.snapshot_id||"");
 const base="zoz_pro_content_calendar?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(CHANNEL_ID);let cal:any[]=[];
 if(body.calendar_id){cal=await db(base+"&id=eq."+encodeURIComponent(String(body.calendar_id))+"&select=id,snapshot_id,working_title,hook,outline,cta,evidence,source_video_id,status,production_package,format&limit=1");if(cal?.[0])snapshotId=String(cal[0].snapshot_id||snapshotId);}
 if(!snapshotId)snapshotId=String(snapList[0]?.id||"");
 if(snapshotId&&!cal.length)cal=await db(base+"&snapshot_id=eq."+encodeURIComponent(snapshotId)+"&select=id,snapshot_id,working_title,hook,outline,cta,evidence,source_video_id,status,production_package,format&order=sequence_no.asc&limit=30");
 const norm=(x:any)=>String(x||"").trim().toLocaleLowerCase("ar").replace(/[؟?!.,،؛:]+/g,"").replace(/\s+/g," ");
 let calendar=(cal||[]).find((x:any)=>norm(x.working_title)===norm(topic))||null;
 if(!calendar&&topic.includes("نب آمون"))calendar=(cal||[]).find((x:any)=>String(x.evidence?.topic_key||"")==="hierarchical_scale_nebamun")||null;
 if(body.calendar_id&&!calendar&&cal?.[0])calendar=cal[0];
 const recs=await db("zoz_pro_content_recommendations?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(CHANNEL_ID)+"&select=id,recommendation_key,recommendation_type,title,body,evidence,snapshot_id,status,updated_at&order=updated_at.desc&limit=30");
 const recList=Array.isArray(recs)?recs:[],related=recList.find((x:any)=>String(x.recommendation_key||"")==="repeat-winner"||String(x.recommendation_type||"")==="repeat_winner")||null;
 if(!snapshotId)snapshotId=String(calendar?.snapshot_id||related?.snapshot_id||"");
 const videoRows=snapshotId?await db("zoz_pro_youtube_video_analytics_snapshots?select=video_id,video_title,metrics&snapshot_id=eq."+encodeURIComponent(snapshotId)+"&order=created_at.desc&limit=500"):[];
 const winner=(Array.isArray(videoRows)?videoRows:[]).map((x:any)=>({id:x.video_id,title:x.video_title,views:Number(x.metrics?.views||0),avd:Number(x.metrics?.average_view_duration_seconds||0),retention:Number(x.metrics?.average_view_percentage||0),subs:Number(x.metrics?.subscribers_gained||0)})).sort((x:any,y:any)=>y.views-x.views)[0]||null;
 const hook=String(calendar?.hook||"").trim()||(topic.includes("نب آمون")?"بصّ على المشهد ده: ليه نب آمون مرسوم أكبر من الفلاحين اللي حواليه؟":"تخيّل إن تفصيلة واحدة في أثر مصري قديم ممكن تغيّر فهمك للقصة كلها…");
 const outline=Array.isArray(calendar?.outline)?calendar.outline.map((x:any)=>String(x)).filter(Boolean):[],source=String(calendar?.evidence?.reference||calendar?.production_package?.evidence?.reference||"").trim(),cta=String(calendar?.cta||"تحب نكشف سر أثر تاني؟ اكتب اقتراحك في التعليقات.").trim(),title=String(calendar?.working_title||topic).trim().slice(0,100);
 let narration:any[]=[{time:"0–4 ث",text:hook},{time:"4–12 ث",text:"حدد القطعة الأثرية ومصدرها قبل تفسير المشهد."},{time:"12–"+Math.max(20,duration-12)+" ث",text:outline[0]||"اقرأ المشهد في سياقه التاريخي وافصل بين وصف المصدر والتفسير."},{time:Math.max(20,duration-12)+"–"+(duration-7)+" ث",text:outline[1]||"لا تفسر التفاصيل بمعزل عن القطعة والفترة والمصدر المتخصص."},{time:(duration-7)+"–"+duration+" ث",text:cta}];
 if(outline.length>=3){const available=Math.max(1,duration-12);narration=[{time:"0–4 ث",text:hook}];outline.forEach((line:string,i:number)=>{const st=Math.round(4+i*available/outline.length),en=Math.round(4+(i+1)*available/outline.length);narration.push({time:st+"–"+en+" ث",text:line});});narration.push({time:(duration-7)+"–"+duration+" ث",text:cta});}
 const refLine=source?"مرجع الخطة (تحقق من مطابقته للقطعة المعروضة): "+source:"لم يُحفظ مرجع أثري محدد لهذه الفكرة؛ لا تنشر قبل إضافة مصدر موثوق.";
 const description="في الفيديو ده بنفحص تفصيلة من تاريخ مصر القديمة، مع التمييز بين ما يذكره المصدر الأثري وما يبقى تفسيرًا.\n\n"+refLine+"\n\n"+cta+"\n\n#مصر_القديمة #الفن_المصري #الفراعنة",tags=["مصر القديمة","الفن المصري القديم","الفراعنة","آثار مصر","تاريخ مصر","Ancient Egypt","Egyptology"];
 const shotPlan=Array.isArray(calendar?.production_package?.shot_plan)?calendar.production_package.shot_plan:[{time:"0–4 ث",visual:"تفصيل واضح من قطعة أثرية موثقة",note:"تحقق من المصدر وحقوق الصورة"},{time:"4–12 ث",visual:"القطعة كاملة وسياقها",note:"لا تخلط بين القطع"},{time:"12–"+(duration-7)+" ث",visual:"لقطات تفصيلية تدعم الفكرة",note:"لا تقدم إعادة بناء مولدة باعتبارها أثرًا أصليًا"},{time:(duration-7)+"–"+duration+" ث",visual:"خاتمة بسؤال للجمهور"}];
 const evidence={snapshot_id:snapshotId||null,winner_video_id:winner?.id||null,winner_title:winner?.title||null,winner_views:winner?.views||0,winner_retention:winner?.retention||0,recommendation_id:related?.id||null,recommendation_title:related?.title||null,calendar_id:calendar?.id||null,calendar_status:calendar?.status||null,source_reference:source||null,fact_check_required:!source};
 const pkg={format:mode==="long"?"YouTube video":"YouTube Short",duration_seconds:duration,hook,narration,shot_plan:shotPlan,cta,title,description,tags,analytics_basis:evidence,source_reference:source||null,source_check_required:!source,owner_approval_required:true};
 let scriptEngine="local-template";
 const ai=await configuredScriptDraft({channel_name:"Hazem Ahmed",niche:"تاريخ مصر القديمة والآثار والحياة اليومية",topic,title,format:pkg.format,duration_seconds:duration,initial_hook:hook,initial_outline:narration,shot_plan:shotPlan,source_reference:source,winner_video:winner,verified_only:true});
 if(ai&&ai.draft&&typeof ai.draft==="object"){const d=ai.draft;scriptEngine=ai.engine;if(typeof d.title==="string"&&d.title.trim())pkg.title=d.title.trim().slice(0,100);if(typeof d.hook==="string"&&d.hook.trim())pkg.hook=d.hook.trim().slice(0,700);if(Array.isArray(d.narration)&&d.narration.length)pkg.narration=d.narration.slice(0,24);if(Array.isArray(d.shot_plan)&&d.shot_plan.length)pkg.shot_plan=d.shot_plan.slice(0,20);if(typeof d.cta==="string"&&d.cta.trim())pkg.cta=d.cta.trim().slice(0,500);if(typeof d.description==="string"&&d.description.trim())pkg.description=d.description.slice(0,5000);if(Array.isArray(d.tags)&&d.tags.length)pkg.tags=d.tags.map((x:any)=>intakeText(x,100)).filter(Boolean).slice(0,20);}
 const finalEvidence={...evidence,script_engine:scriptEngine,ai_fallback_used:scriptEngine==="local-template"};
 const result=await db("zoz_pro_content_scripts",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({owner_id:u.id,channel_id:CHANNEL_ID,snapshot_id:snapshotId||null,recommendation_id:body.recommendation_id||related?.id||null,calendar_id:body.calendar_id||calendar?.id||null,topic,title:pkg.title||title,description:pkg.description||description,tags:pkg.tags||tags,hook:pkg.hook||hook,narration:pkg.narration||narration,shot_plan:pkg.shot_plan||shotPlan,cta:pkg.cta||cta,evidence:finalEvidence,production_package:pkg,generation_method:scriptEngine,status:"draft"})});
 return json({ok:true,script:result?.[0]||pkg,analytics_winner:winner,recommendation:related,calendar_item:calendar,method:scriptEngine,script_engine:scriptEngine,message:source?"تم حفظ المسودة وربطها بلقطة التحليل وخطة المحتوى ومصدر الخطة؛ راجع مطابقة المصدر للمشهد.":"تم حفظ المسودة من التحليلات، لكن يلزم توثيق المصدر الأثري قبل الإنتاج."});
}
async function listLocalContentStudio(req:Request,u:any){
 const body=await req.json().catch(()=>({})),channelId=String(body.channel_id||CHANNEL_ID);
 const known=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=channel_id&limit=1");
 if(!known?.[0])return fail("القناة غير مسجلة لهذا المالك.",404);
 const rows=await db("zoz_pro_content_scripts?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=id,channel_id,topic,title,status,created_at,generation_method,production_package&order=created_at.desc&limit=30");
 return json({ok:true,channel_id:channelId,scripts:rows||[]});
}

async function vidiqStatus(req:Request,u:any){
 const accounts=await vidiqAccountBalances(u.id);
 const connected=accounts.filter(x=>x.connected);
 const configured=accounts.filter(x=>x.configured);
 return json({ok:true,provider:"vidIQ MCP",accounts,configured_accounts:configured.length,connected_accounts:connected.length,
  selection_policy:"For credit-consuming vidIQ research, use the connected account with the highest live balance that meets the task's minimum credit cost. This does not choose or perform YouTube publishing.",
  required_secrets:["VIDIQ_MCP_API_KEY_ZOZ_HAZEM","VIDIQ_MCP_API_KEY_HAZEM_NOW","VIDIQ_MCP_API_KEY_ZOZ_MANAGER"],
  message:connected.length===0?"لم يتم إعداد مفاتيح vidIQ الثلاثة في أسرار مشروع الإنتاج بعد.":"تم فحص كل حساب تم إعداد مفتاحه؛ الحسابات غير المهيأة ستظل معلّمة بانتظار المفتاح."});
}
async function vidiqResearch(req:Request,u:any){
 const body=await req.json().catch(()=>({}));
 const mode=String(body.mode||"keyword")==="titles"?"titles":"keyword";
 const topic=intakeText(body.topic,250),description=intakeText(body.description,3500);
 if(!topic)return fail("Provide a topic or draft title for vidIQ research.",400);
 const minimumCredits=5;
 const balances=await vidiqAccountBalances(u.id);
 const selected=chooseVidiqAccount(balances,minimumCredits);
 if(!selected){
  const summary=balances.map(x=>({account:x.label,status:x.status,credits_remaining:x.credits_remaining}));
  await db("zoz_pro_vidiq_research_runs",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({
   owner_id:u.id,channel_id:CHANNEL_ID,topic,research_mode:mode,status:"blocked_no_eligible_account",
   request_payload:{mode,topic,minimum_credits:minimumCredits,account_balances:summary},result_payload:{},error_message:"No configured vidIQ account had enough confirmed credits."
  })}).catch(()=>null);
  return json({ok:false,error:"لا يوجد حساب vidIQ متصل برصيد مؤكد يكفي لهذه العملية. لم يُستهلك أي رصيد.",minimum_credits:minimumCredits,accounts:balances},402);
 }
 const slot=VIDIQ_ACCOUNT_SLOTS.find(x=>x.key===selected.key);
 const apiKey=slot?await vidiqAccountSecret(u.id,slot.key):"";
 try{
  const session=await vidiqMcpStart(apiKey);
  const toolName=mode==="titles"?"vidiq_generate_titles":"vidiq_keyword_research";
  const args=mode==="titles"
   ?{title:topic,description:description||undefined,numTitles:5,type:"short",language:"ar",regionCode:"EG"}
   :{mode:"research",keyword:topic,includeRelated:true,country:"EG",limit:10,language:"ar"};
  const called=await vidiqCallTool(apiKey,session,toolName,args,4);
  const resultValue=called.value;
  const afterBalance=await vidiqCallTool(apiKey,session,"vidiq_balance",{},5).catch(()=>null);
  const remaining=afterBalance?vidiqCredits(afterBalance.value):null;
  const savedRows=await db("zoz_pro_vidiq_research_runs",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({
   owner_id:u.id,channel_id:CHANNEL_ID,topic,research_mode:mode,status:"succeeded",
   request_payload:{mode,topic,tool_name:toolName,description:description||null,account_key:selected.key,account_label:selected.label,credits_before:selected.credits_remaining,minimum_credits:minimumCredits},
   result_payload:resultValue,error_message:null
  })});
  const saved=savedRows?.[0]||null;
  await db("zoz_pro_automation_runs",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({
   workflow:"vidiq_"+mode,channel_id:CHANNEL_ID,status:"succeeded",
   details:{research_run_id:saved?.id||null,topic,tool_name:toolName,vidiq_account:selected.key,credits_before:selected.credits_remaining,credits_after:remaining}
  })}).catch(()=>null);
  return json({ok:true,connected:true,research_run_id:saved?.id||null,topic,mode,tool_name:toolName,
   selected_account:{key:selected.key,label:selected.label},credits_before:selected.credits_remaining,credits_remaining:remaining,
   result:resultValue,message:"تم اختيار الحساب ذي الرصيد المؤكد الأعلى وتنفيذ بحث vidIQ واحد عليه. لم يحدث أي رفع أو نشر."});
 }catch(e){
  const message=e instanceof Error?e.message:"vidIQ research failed.";
  await db("zoz_pro_vidiq_research_runs",{method:"POST",headers:{prefer:"return=minimal"},body:JSON.stringify({
   owner_id:u.id,channel_id:CHANNEL_ID,topic,research_mode:mode,status:"failed",
   request_payload:{mode,topic,account_key:selected.key,account_label:selected.label},result_payload:{},error_message:message.slice(0,500)
  })}).catch(()=>null);
  return fail(message,502);
 }
}
async function vidiqResearchRuns(u:any){
 const rows=await db("zoz_pro_vidiq_research_runs?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(CHANNEL_ID)+"&select=id,topic,research_mode,status,result_payload,error_message,created_at&order=created_at.desc&limit=20");
 return json({ok:true,runs:rows||[]});
}

async function intakeUploadPartDirect(req:Request,u:any){
 const url=new URL(req.url),id=String(url.searchParams.get("asset_id")||""),part=Number(url.searchParams.get("part_index"));
 const a=await intakeAsset(u,id);
 if(a.status!=="uploading")return fail("This intake asset is not accepting file parts.",409);
 if(!Number.isInteger(part)||part<0||part>=a.chunk_count)return fail("Invalid file part index.",400);
 const start=part*a.chunk_size,expected=Math.min(a.chunk_size,a.total_bytes-start);
 const bytes=new Uint8Array(await req.arrayBuffer());
 if(bytes.byteLength!==expected)return fail("Uploaded part size mismatch: expected "+expected+" bytes but received "+bytes.byteLength+".",400);
 const ownerAuthorization=req.headers.get("authorization")||"";
 if(!ownerAuthorization.toLowerCase().startsWith("bearer "))return fail("Owner session authorization is missing from the upload request.",401);
 const path=a.storage_prefix+"/part-"+String(part).padStart(5,"0")+".bin";
 const storagePath=path.split("/").map(encodeURIComponent).join("/");
 const upload=await fetch(SUPABASE_URL+"/storage/v1/object/"+INTAKE_BUCKET+"/"+storagePath,{method:"POST",headers:{...dbHeaders(),"content-type":"application/octet-stream","x-upsert":"true"},body:bytes});
 if(!upload.ok){
  const body=await upload.text().catch(()=>"");
  throw new Error("Supabase service-side storage upload failed (HTTP "+upload.status+"): "+body.slice(0,180));
 }
 return json({ok:true,asset_id:a.id,part_index:part,uploaded_bytes:bytes.byteLength});
}


async function intakePartDone(req:Request,u:any){
 const b=await req.json().catch(()=>({})),a=await intakeAsset(u,String(b.asset_id||"")),part=Number(b.part_index);
 if(a.status!=="uploading")return fail("Asset is not accepting uploads.",409);
 if(!Number.isInteger(part)||part<0||part>=a.chunk_count)return fail("Invalid part index.",400);
 const checkPath=a.storage_prefix+"/part-"+String(part).padStart(5,"0")+".bin";
 const check=await fetch(SUPABASE_URL+"/storage/v1/object/"+INTAKE_BUCKET+"/"+checkPath.split("/").map(encodeURIComponent).join("/"),{method:"HEAD",headers:dbHeaders()});
 const expected=Math.min(a.chunk_size,a.total_bytes-part*a.chunk_size);
 if(!check.ok||Number(check.headers.get("content-length")||0)!==expected)return fail("The storage object is missing or its byte size does not match the expected part size.",409);
 const parts=Array.isArray(a.uploaded_parts)?a.uploaded_parts.map(Number):[];
 if(!parts.includes(part))parts.push(part);parts.sort((x:number,y:number)=>x-y);
 const uploaded=parts.reduce((sum:number,n:number)=>sum+Math.min(a.chunk_size,a.total_bytes-n*a.chunk_size),0);
 await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({uploaded_parts:parts,uploaded_bytes:uploaded,updated_at:new Date().toISOString()})});
 await intakeEvent(a,"upload_part_received",a.status,a.status,{part_index:part,uploaded_parts:parts.length,chunk_count:a.chunk_count});
 return json({ok:true,uploaded_parts:parts.length,chunk_count:a.chunk_count,uploaded_bytes:uploaded,total_bytes:a.total_bytes});
}
async function intakeFinalize(req:Request,u:any){
 const b=await req.json().catch(()=>({})),a=await intakeAsset(u,String(b.asset_id||"")),parts=Array.isArray(a.uploaded_parts)?a.uploaded_parts.map(Number):[];
 if(a.status!=="uploading")return fail("Asset cannot be finalized in this state.",409);
 if(parts.length!==a.chunk_count||parts.some((x:number,i:number)=>x!==i))return fail("Upload incomplete. Missing parts: "+Array.from({length:a.chunk_count},(_,i)=>i).filter(i=>!parts.includes(i)).slice(0,20).join(", "),409);
 await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"ready_for_review",uploaded_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
 await intakeEvent(a,"upload_completed","uploading","ready_for_review",{uploaded_bytes:a.total_bytes});
 return json({ok:true,asset_id:a.id,status:"ready_for_review"});
}
async function intakeStatus(req:Request,u:any){
 const b=await req.json().catch(()=>({}));
 const a=await intakeAsset(u,String(b.asset_id||""));
 return json({ok:true,asset:{
  id:a.id,status:a.status,channel_id:a.channel_id,title:a.title,
  total_bytes:Number(a.total_bytes||0),uploaded_bytes:Number(a.uploaded_bytes||0),
  chunk_size:Number(a.chunk_size||INTAKE_CHUNK_BYTES),chunk_count:Number(a.chunk_count||0),
  uploaded_parts:Array.isArray(a.uploaded_parts)?a.uploaded_parts.map(Number):[],
  updated_at:a.updated_at
 }});
}
async function intakeList(req:Request,u:any){
 const body=await req.json().catch(()=>({})),channelId=String(body.channel_id||CHANNEL_ID);
 const known=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=channel_id&limit=1");
 if(!known?.[0])return fail("القناة غير مسجلة لهذا المالك.",404);
 const rows=await db("zoz_pro_video_intake_assets?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=id,channel_id,source_name,original_filename,total_bytes,uploaded_bytes,chunk_count,uploaded_parts,status,title,description,target_privacy_status,youtube_video_id,youtube_processing_status,youtube_failure_reason,last_error,metadata,created_at,updated_at,published_at,archived_at&order=created_at.desc&limit=100");
 return json({ok:true,channel_id:channelId,assets:rows||[]});
}

async function intakeReview(req:Request,u:any){
 const b=await req.json().catch(()=>({})),a=await intakeAsset(u,String(b.asset_id||"")),decision=String(b.decision||"");
 if(decision==="reject"&&["ready_for_review","approved","failed"].includes(a.status)){
  await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"rejected",owner_note:intakeText(b.note,1000),updated_at:new Date().toISOString()})});
  await intakeEvent(a,"owner_rejected",a.status,"rejected",{note:intakeText(b.note,1000)});return json({ok:true,status:"rejected"});
 }
 if(decision==="approve"&&a.status==="ready_for_review"){
  if(!a.title||a.made_for_kids===null||a.contains_synthetic_media===null)return fail("Set title, made-for-kids yes/no and synthetic-media disclosure yes/no before approval.",400);
  await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"approved",owner_note:intakeText(b.note,1000),updated_at:new Date().toISOString()})});
  await intakeEvent(a,"owner_approved",a.status,"approved",{});return json({ok:true,status:"approved"});
 }
 return fail("Decision not allowed for the current state.",409);
}
async function intakeSourceCreate(req:Request,u:any){
 const b=await req.json().catch(()=>({})),name=intakeText(b.source_name,120),channelId=String(u.is_intake_source?u.channel_id:(b.channel_id||CHANNEL_ID));
 if(u.is_intake_source)return fail("مراكز الإنتاج لا يمكنها إنشاء رموز مراكز أخرى.",403);
 if(!name)return fail("Provide the production center name.",400);
 const known=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=channel_id&limit=1");
 if(!known?.[0])return fail("القناة غير مسجلة لهذا المالك.",404);
 const token="zoz_intake_"+crypto.randomUUID().replace(/-/g,"")+crypto.randomUUID().replace(/-/g,"");
 const rows=await db("zoz_pro_video_intake_sources",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({owner_id:u.id,channel_id:channelId,source_name:name,secret_hash:await sha(token),is_active:true})});
 if(!rows?.[0])throw new Error("Could not register integration.");
 return json({ok:true,source:{id:rows[0].id,channel_id:channelId,source_name:name},token,warning:"Copy this token now. It is shown once and cannot approve or publish."});
}
async function intakeSourceList(req:Request,u:any){
 const b=await req.json().catch(()=>({})),channelId=String(b.channel_id||CHANNEL_ID);
 const known=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=channel_id&limit=1");
 if(!known?.[0])return fail("القناة غير مسجلة لهذا المالك.",404);
 const rows=await db("zoz_pro_video_intake_sources?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=id,channel_id,source_name,is_active,expires_at,last_used_at,created_at,revoked_at&order=created_at.desc&limit=100");
 return json({ok:true,channel_id:channelId,sources:rows||[]});
}
async function intakeSourceRevoke(req:Request,u:any){
 const b=await req.json().catch(()=>({})),id=String(b.source_id||"");
 if(!/^[0-9a-f-]{36}$/i.test(id))return fail("Invalid source id.",400);
 await db("zoz_pro_video_intake_sources?id=eq."+encodeURIComponent(id)+"&owner_id=eq."+encodeURIComponent(u.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({is_active:false,revoked_at:new Date().toISOString()})});
 return json({ok:true,revoked:true});
}

async function intakeImportVidiq(req:Request,u:any){
 let videoId="",assetId="";
 try{
  const b=await req.json().catch(()=>({}));
  const sourceUrlText=String(b.source_url||"").trim();
  let sourceUrl:URL;
  try{sourceUrl=new URL(sourceUrlText)}catch{return fail("Paste the full temporary MP4 link provided by vidIQ.",400)}
  if(sourceUrl.protocol!=="https:"||sourceUrl.hostname!=="storage.googleapis.com"||!sourceUrl.pathname.startsWith("/vidiq-user-videos/"))return fail("Only a valid vidIQ-hosted video link is accepted.",403);
  const title=intakeText(b.title,100),description=intakeText(b.description,5000);
  const tags=Array.isArray(b.tags)?b.tags.map((x:any)=>intakeText(x,100)).filter(Boolean).slice(0,30):[];
  if(!title)return fail("A YouTube title is required (maximum 100 characters).",400);
  if(typeof b.made_for_kids!=="boolean"||typeof b.contains_synthetic_media!=="boolean")return fail("Set both the made-for-kids and synthetic-media declarations.",400);
  const remote=await fetch(sourceUrl.toString(),{redirect:"error"});
  if(!remote.ok)throw new Error("The vidIQ link could not be downloaded (HTTP "+remote.status+"). Generate a fresh export link and try again.");
  const contentType=String(remote.headers.get("content-type")||"video/mp4").split(";")[0].trim().toLowerCase();
  if(!["video/mp4","video/quicktime","application/octet-stream"].includes(contentType))throw new Error("The vidIQ link did not return an MP4/MOV video.");
  const announced=Number(remote.headers.get("content-length")||0);
  if(announced>100*1024*1024)throw new Error("This handoff supports videos up to 100 MB; use the normal segmented upload for larger files.");
  const bytes=new Uint8Array(await remote.arrayBuffer());
  if(bytes.byteLength<1||bytes.byteLength>100*1024*1024)throw new Error("The returned video is empty or exceeds the 100 MB vidIQ handoff limit.");
  const saved=await writeToken(u);
  const meta={snippet:{title,description,tags,categoryId:"27",defaultLanguage:"ar",defaultAudioLanguage:"ar"},status:{privacyStatus:"private",selfDeclaredMadeForKids:b.made_for_kids,containsSyntheticMedia:b.contains_synthetic_media}};
  const init=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",{method:"POST",headers:{authorization:"Bearer "+saved.access_token,"content-type":"application/json; charset=UTF-8","x-upload-content-length":String(bytes.byteLength),"x-upload-content-type":contentType},body:JSON.stringify(meta)});
  const location=init.headers.get("location");
  if(!init.ok||!location){const d=await init.json().catch(()=>({}));throw new Error("YouTube upload session failed (HTTP "+init.status+"): "+String(d?.error?.message||"No upload session returned").slice(0,180));}
  const put=await fetch(location,{method:"PUT",headers:{"content-type":contentType,"content-length":String(bytes.byteLength),"content-range":"bytes 0-"+(bytes.byteLength-1)+"/"+bytes.byteLength},body:bytes});
  if(put.status!==200&&put.status!==201){const body=await put.text().catch(()=>"");throw new Error("YouTube rejected the private upload (HTTP "+put.status+"): "+body.slice(0,180));}
  const result=await put.json().catch(()=>({}));
  videoId=String(result?.id||"");
  if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))throw new Error("YouTube did not return a valid video ID.");
  const verification=await verifyManagedVideo(videoId,saved.access_token);
  if(verification.status?.privacyStatus!=="private")throw new Error("YouTube did not confirm private visibility. The item was not marked ready in ZOZ Pro.");
  const now=new Date().toISOString();
  const row={
   owner_id:u.id,channel_id:CHANNEL_ID,source_id:null,source_name:"vidIQ handoff",
   original_filename:intakeText(b.filename||"vidiq-video.mp4",240),content_type:contentType,total_bytes:bytes.byteLength,
   chunk_size:bytes.byteLength,chunk_count:1,uploaded_parts:[0],status:"processing",
   title,description,tags,made_for_kids:b.made_for_kids,contains_synthetic_media:b.contains_synthetic_media,
   target_privacy_status:b.target_privacy_status==="unlisted"?"unlisted":"public",owner_note:"استيراد vidIQ؛ الفيديو مرفوع إلى YouTube بوضع خاص، والنشر العام يحتاج تأكيد المالك.",
   storage_prefix:"",uploaded_bytes:bytes.byteLength,youtube_video_id:videoId,youtube_processing_status:"processing",
   youtube_upload_session:null,uploaded_at:now,last_error:null,
   metadata:{integration_version:"zoz-vidiq-handoff-v1",storage_strategy:"vidiq-direct-youtube-private",source_url_removed:true},
   updated_at:now
  };
  const rows=await db("zoz_pro_video_intake_assets",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify(row)});
  const created=rows?.[0];
  if(!created)throw new Error("The private video reached YouTube, but ZOZ Pro could not save its tracking record. Video ID: "+videoId);
  assetId=String(created.id);
  await intakeEvent(created,"vidiq_private_upload",null,"processing",{youtube_video_id:videoId,bytes:bytes.byteLength});
  return json({ok:true,status:"processing",asset_id:assetId,youtube_video_id:videoId,privacy_status:"private",url:"https://www.youtube.com/watch?v="+videoId,title,total_bytes:bytes.byteLength,message:"Imported from vidIQ and uploaded privately. Review and publish separately from the ZOZ Pro intake list."});
 }catch(e){
  const message=e instanceof Error?e.message:"vidIQ handoff failed.";
  if(assetId)await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(assetId)+"&owner_id=eq."+encodeURIComponent(u.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({last_error:message.slice(0,500),updated_at:new Date().toISOString()})}).catch(()=>null);
  return fail(message,502);
 }
}


async function intakeStartYoutube(req:Request,u:any){
 const b=await req.json().catch(()=>({})),a=await intakeAsset(u,String(b.asset_id||""));
 if(u.is_intake_source)return fail("مركز الإنتاج لا يستطيع رفع الفيديو إلى YouTube؛ هذه صلاحية للمالك فقط.",403);
 if(a.status!=="approved")return fail("Owner approval is required before YouTube upload.",409);
 if(!a.title||a.made_for_kids===null||a.contains_synthetic_media===null)return fail("Title and required audience/disclosure choices are missing.",400);
 const saved=await writeToken(u,a.channel_id),meta={snippet:{title:a.title,description:a.description||"",tags:Array.isArray(a.tags)?a.tags:[],categoryId:"27",defaultLanguage:"ar"},status:{privacyStatus:"private",selfDeclaredMadeForKids:a.made_for_kids,containsSyntheticMedia:a.contains_synthetic_media}};
 const r=await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",{method:"POST",headers:{authorization:"Bearer "+saved.access_token,"content-type":"application/json; charset=UTF-8","x-upload-content-length":String(a.total_bytes),"x-upload-content-type":a.content_type||"video/mp4"},body:JSON.stringify(meta)});
 if(!r.ok||!r.headers.get("location")){const d=await r.json().catch(()=>({}));throw new Error("YouTube upload session failed (HTTP "+r.status+"): "+String(d?.error?.message||"No session returned").slice(0,200));}
 await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"uploading_to_youtube",youtube_upload_session:r.headers.get("location"),uploaded_bytes:0,last_error:null,updated_at:new Date().toISOString()})});
 await intakeEvent(a,"youtube_upload_started",a.status,"uploading_to_youtube",{});
 return json({ok:true,status:"uploading_to_youtube",message:"Upload session created. The video stays private until separately published."});
}
async function intakeYoutubePart(req:Request,u:any){
 const b=await req.json().catch(()=>({})),a=await intakeAsset(u,String(b.asset_id||"")),part=Number(b.part_index);
 if(a.status!=="uploading_to_youtube"||!a.youtube_upload_session)return fail("No active YouTube upload session.",409);
 if(!Number.isInteger(part)||part<0||part>=a.chunk_count)return fail("Invalid part index.",400);
 const start=part*a.chunk_size,end=Math.min(a.total_bytes-1,start+a.chunk_size-1);
 if(Number(a.uploaded_bytes||0)!==start)return fail("Upload parts must be sequential; expected byte offset "+Number(a.uploaded_bytes||0)+".",409);
 const path=a.storage_prefix+"/part-"+String(part).padStart(5,"0")+".bin";
 const file=await fetch(SUPABASE_URL+"/storage/v1/object/"+INTAKE_BUCKET+"/"+path.split("/").map(encodeURIComponent).join("/"),{headers:dbHeaders()});
 if(!file.ok)throw new Error("Could not read stored part "+part+" ("+file.status+").");
 const bytes=await file.arrayBuffer();if(bytes.byteLength!==end-start+1)throw new Error("Stored part length mismatch.");
 const saved=await writeToken(u,a.channel_id);
 const response=await fetch(a.youtube_upload_session,{method:"PUT",headers:{"content-length":String(bytes.byteLength),"content-range":"bytes "+start+"-"+end+"/"+a.total_bytes,"content-type":a.content_type||"video/mp4"},body:bytes});
 if(response.status===308){
  const uploaded=end+1;await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({uploaded_bytes:uploaded,updated_at:new Date().toISOString()})});
  return json({ok:true,status:"uploading_to_youtube",uploaded_bytes:uploaded,total_bytes:a.total_bytes,complete:false});
 }
 if(response.status===200||response.status===201){
  const d=await response.json().catch(()=>({})),videoId=String(d?.id||"");if(!/^[A-Za-z0-9_-]{11}$/.test(videoId))throw new Error("YouTube did not return a valid video ID.");
  await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"processing",youtube_video_id:videoId,uploaded_bytes:a.total_bytes,youtube_upload_session:null,youtube_processing_status:"processing",updated_at:new Date().toISOString()})});
  await intakeEvent(a,"youtube_upload_complete","uploading_to_youtube","processing",{youtube_video_id:videoId});
  return json({ok:true,status:"processing",youtube_video_id:videoId,complete:true});
 }
 const err=await response.text().catch(()=>"");await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({last_error:"YouTube upload HTTP "+response.status,updated_at:new Date().toISOString()})});
 throw new Error("YouTube upload failed (HTTP "+response.status+"): "+err.slice(0,150));
}
async function intakeCheckProcessing(req:Request,u:any){
 const b=await req.json().catch(()=>({})),a=await intakeAsset(u,String(b.asset_id||""));
 if(!["processing","ready_to_publish","published"].includes(a.status)||!a.youtube_video_id)return fail("No uploaded YouTube video to check.",409);
 const saved=await writeToken(u,a.channel_id),d=await youtubeJson("https://www.googleapis.com/youtube/v3/videos?part=snippet,status,processingDetails&id="+encodeURIComponent(a.youtube_video_id),saved.access_token),v=(d.items||[])[0];
 if(!v||v.snippet?.channelId!==a.channel_id)return fail("Video could not be verified on the selected channel.",502);
 const p=String(v.processingDetails?.processingStatus||"unknown"),up=String(v.status?.uploadStatus||"unknown"),privacy=String(v.status?.privacyStatus||"private");
 let status=a.status;
 let publishedAt=a.published_at||null;
 // Reconcile the production queue with YouTube's real state. A video already
 // confirmed public must not remain in "ready_to_publish" and invite a second
 // publication action. This changes only ZOZ Pro's record, never YouTube.
 if(a.status!=="published"){
  if(p==="succeeded"&&["uploaded","processed"].includes(up)){
   if(privacy==="public"){
    status="published";
    publishedAt=v.snippet?.publishedAt||publishedAt||new Date().toISOString();
   }else if(a.status==="processing"){
    status="ready_to_publish";
   }
  }
  if(p==="failed"||up==="failed")status="failed";
 }
 await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({
  status,
  youtube_processing_status:p,
  youtube_failure_reason:v.processingDetails?.processingFailureReason||null,
  last_error:status==="failed"?(v.processingDetails?.processingFailureReason||up):null,
  published_at:status==="published"?publishedAt:a.published_at,
  updated_at:new Date().toISOString()
 })});
 if(status!==a.status){
  const reconciledPublic=status==="published"&&privacy==="public";
  await intakeEvent(a,reconciledPublic?"reconciled_public_video":"processing_checked",a.status,status,{
   processing_status:p,upload_status:up,privacy_status:privacy,
   publication_source:reconciledPublic?"verified_youtube_api_state":null,
   youtube_video_id:a.youtube_video_id,
   note:reconciledPublic?"YouTube confirmed this video was already public; only the ZOZ Pro queue record was reconciled.":null
  });
 }
 return json({ok:true,status,processing_status:p,upload_status:up,privacy_status:privacy,youtube_video_id:a.youtube_video_id,published_at:status==="published"?publishedAt:null,reconciled_without_youtube_change:status==="published"&&privacy==="public"});
}
async function intakePublish(req:Request,u:any){
 const b=await req.json().catch(()=>({}));if(b.publish_confirmed!==true)return fail("Explicit owner confirmation is required.",400);
 const a=await intakeAsset(u,String(b.asset_id||""));if(a.status!=="ready_to_publish"||!a.youtube_video_id)return fail("Only a processed and reviewed video can be published.",409);
 const saved=await writeToken(u,a.channel_id),v=await verifyManagedVideo(a.youtube_video_id,saved.access_token,a.channel_id),privacy=a.target_privacy_status==="unlisted"?"unlisted":"public";
 const status={...(v.status||{}),privacyStatus:privacy,selfDeclaredMadeForKids:a.made_for_kids,containsSyntheticMedia:a.contains_synthetic_media};
 await youtubeJson("https://www.googleapis.com/youtube/v3/videos?part=status",saved.access_token,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({id:a.youtube_video_id,status})});
 await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"published",published_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
 await intakeEvent(a,"owner_published","ready_to_publish","published",{youtube_video_id:a.youtube_video_id,privacy_status:privacy});
 return json({ok:true,status:"published",youtube_video_id:a.youtube_video_id,privacy_status:privacy,url:"https://www.youtube.com/watch?v="+a.youtube_video_id});
}
async function intakeArchive(req:Request,u:any){
 const b=await req.json().catch(()=>({})),a=await intakeAsset(u,String(b.asset_id||""));
 if(a.status!=="published")return fail("Only published videos can be archived.",409);
 let removedParts=0;
 if(a.metadata?.storage_strategy!=="vidiq-direct-youtube-private"){
  const paths=Array.from({length:a.chunk_count},(_,i)=>a.storage_prefix+"/part-"+String(i).padStart(5,"0")+".bin");
  const r=await fetch(SUPABASE_URL+"/storage/v1/object/"+INTAKE_BUCKET,{method:"DELETE",headers:{...dbHeaders(),"content-type":"application/json"},body:JSON.stringify({prefixes:paths})});
  if(!r.ok)throw new Error("Temporary storage cleanup failed (HTTP "+r.status+").");
  removedParts=paths.length;
 }
 await db("zoz_pro_video_intake_assets?id=eq."+encodeURIComponent(a.id),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"archived",archived_at:new Date().toISOString(),storage_prefix:"",updated_at:new Date().toISOString()})});
 await intakeEvent(a,"temporary_storage_archived","published","archived",{removed_parts:removedParts,channel_id:a.channel_id});
 return json({ok:true,status:"archived",channel_id:a.channel_id,removed_parts:removedParts});
}

async function runAutopilotHandoff(req: Request) {
 const u=await owner(req);if(!u)return fail("Scheduled handoff authentication failed.",401);
 return json({ok:true,workflow:"approved_recommendation_handoff",disabled:true,checked:0,imported:0,rejected:0,message:"Cross-project handoff is disabled to prevent content and channel data from being sent to the legacy/preview project. Production data remains in this project."});
}

async function automationHistory(u:any){
 const rows=await db("zoz_pro_automation_runs?select=id,workflow,channel_id,status,started_at,finished_at,details&order=started_at.desc&limit=30");
 const managed=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&select=channel_id");
 const allowed=new Set((Array.isArray(managed)?managed:[]).map((x:any)=>String(x.channel_id)));
 return json({ok:true,runs:(Array.isArray(rows)?rows:[]).filter((x:any)=>!x.channel_id||allowed.has(String(x.channel_id))).slice(0,20)});
}
async function managedChannelDashboard(u:any){
 const channels=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&is_active=eq.true&select=channel_id,channel_title,display_name,niche,target_audience,default_language,content_tone,channel_goal,monetization_strategy,connection_status,last_synced_at,updated_at&order=display_name.asc");
 const results=[];
 for(const ch of (Array.isArray(channels)?channels:[])){
  const cid=String(ch.channel_id||"");
  const [live,snaps,recs]=await Promise.all([
   db("zoz_pro_managed_channel_live_status?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=channel_title,channel_statistics,recent_videos,source,captured_at,last_attempt_at,last_error&limit=1"),
   db("zoz_pro_managed_channel_snapshots?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=id,start_date,end_date,snapshot_day,created_at,metrics,daily_metrics,traffic_sources_daily,video_count,analytics_video_count,source&order=created_at.desc&limit=2"),
   db("zoz_pro_managed_channel_recommendations?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=id,title,body,recommendation_type,status,evidence,updated_at&order=updated_at.desc&limit=5")
  ]);
  results.push({...ch,live:(live||[])[0]||null,latest_analytics:(snaps||[])[0]||null,previous_analytics:(snaps||[])[1]||null,recommendations:recs||[]});
 }
 return json({ok:true,refreshed_at:new Date().toISOString(),channels:results,refresh_policy:{dashboard_poll_seconds:60,background_sync_hours:4,analytics_delay_note:"YouTube Analytics may lag; channel/video counters are refreshed by YouTube Data API."}});
}
async function runLiveMonitor(req:Request){
 const u=await owner(req);if(!u)return fail("Scheduled live-monitor authentication failed.",401);
 const token=req.headers.get("x-zoz-autopilot-token")||"";
 const startDate=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
 const endDate=new Date(Date.now()-3*86400000).toISOString().slice(0,10);
 let runId="";
 try{
  const rows=await db("zoz_pro_automation_runs",{method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({workflow:"live_channel_monitor",channel_id:CHANNEL_ID,status:"running",details:{start_date:startDate,end_date:endDate}})});
  runId=String(rows?.[0]?.id||"");
  const channels=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&is_active=eq.true&select=channel_id,display_name&order=display_name.asc");
  const results=[];
  for(const ch of (Array.isArray(channels)?channels:[])){
   const cid=String(ch.channel_id||"");
   try{
    const response=await fetch(SELF+"?action=managed_channel_sync",{method:"POST",headers:{"content-type":"application/json","x-zoz-autopilot-token":token},body:JSON.stringify({channel_id:cid,start_date:startDate,end_date:endDate})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data?.ok===false)throw new Error(String(data?.error||"sync failed").slice(0,250));
    results.push({channel_id:cid,display_name:ch.display_name,ok:true,captured_at:data.synced_at,views:data.metrics?.views,video_count:Array.isArray(data.videos)?data.videos.length:0});
   }catch(e){
    const message=e instanceof Error?e.message:"monitor failed";
    await db("zoz_pro_managed_channel_live_status?on_conflict=owner_id,channel_id",{method:"POST",headers:{prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({owner_id:u.id,channel_id:cid,last_attempt_at:new Date().toISOString(),last_error:message.slice(0,300)})}).catch(()=>null);
    results.push({channel_id:cid,display_name:ch.display_name,ok:false,error:message.slice(0,250)});
   }
  }
  const details={start_date:startDate,end_date:endDate,channels:results,succeeded:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length};
  if(runId)await db("zoz_pro_automation_runs?id=eq."+encodeURIComponent(runId),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:details.failed===0?"succeeded":"partial",finished_at:new Date().toISOString(),details})});
  return json({ok:true,workflow:"live_channel_monitor",...details});
 }catch(e){
  const message=e instanceof Error?e.message:"live monitor failed";
  if(runId)await db("zoz_pro_automation_runs?id=eq."+encodeURIComponent(runId),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"failed",finished_at:new Date().toISOString(),details:{error:message.slice(0,500)}})}).catch(()=>null);
  return fail(message,502);
 }
}

async function runAutopilot(req: Request) {
  const u = await owner(req);
  if (!u) return fail("Scheduled automation authentication failed.", 401);
  const token = req.headers.get("x-zoz-autopilot-token") || "";
  const endDate = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
  const startDate = new Date(Date.parse(endDate + "T00:00:00Z") - 27 * 86400000).toISOString().slice(0, 10);
  let runId = "";
  try {
    const runRows = await db("zoz_pro_automation_runs", {method:"POST",headers:{prefer:"return=representation"},body:JSON.stringify({workflow:"daily_youtube_analytics",channel_id:CHANNEL_ID,status:"running",details:{start_date:startDate,end_date:endDate}})});
    runId = String(runRows?.[0]?.id || "");
    const call = async (action: string, body: Record<string,unknown> = {}) => {
      const response = await fetch(SELF + "?action=" + encodeURIComponent(action), {method:"POST",headers:{"content-type":"application/json","x-zoz-autopilot-token":token},body:JSON.stringify(body)});
      const data = await response.json().catch(()=>({}));
      if (!response.ok || data?.ok === false) throw new Error(action + ": " + String(data?.error || "HTTP " + response.status).slice(0,220));
      return data;
    };
    const analytics = await call("analytics",{start_date:startDate,end_date:endDate,channel_id:CHANNEL_ID});
    const videoList = await call("videos");
    const perVideo = await call("video_analytics",{start_date:startDate,end_date:endDate,channel_id:CHANNEL_ID});
    const metricMap = new Map<string,unknown>((Array.isArray(perVideo.videos)?perVideo.videos:[]).map((v:any)=>[String(v.video_id),v]));
    const videos = (Array.isArray(videoList.videos)?videoList.videos:[]).map((v:any)=>({video_id:String(v.video_id||""),title:String(v.title||""),published_at:String(v.published_at||""),privacy_status:String(v.privacy_status||""),metrics:metricMap.get(String(v.video_id))||null}));
    const saved = await call("save_snapshot",{channel_id:CHANNEL_ID,start_date:startDate,end_date:endDate,metrics:analytics.metrics,daily:analytics.daily,traffic_sources_daily:analytics.traffic_sources_daily,missing_dates:analytics.missing_dates,videos});
    // Daily managed-channel automation: each channel is synchronized and written only to its own channel_id partition.
    const managedRows=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&is_active=eq.true&select=channel_id,display_name,niche&order=channel_title.asc");
    const channelRuns:any[]=[];
    for(const managed of (Array.isArray(managedRows)?managedRows:[])){
      const cid=String(managed.channel_id||"");
      if(!/^UC[A-Za-z0-9_-]{22}$/.test(cid))continue;
      try{
        const synced=await call("managed_channel_sync",{channel_id:cid,start_date:startDate,end_date:endDate});
        let calendar:any={created:false,count:0};
        if(cid!==CHANNEL_ID && !String(managed.niche||"").includes("وجهة القناة قيد التحقق")){
          const cal=await call("managed_channel_calendar_generate",{channel_id:cid});
          calendar={created:Boolean(cal.created),count:Array.isArray(cal.calendar)?cal.calendar.length:0};
        }
        let news:any={checked:false,new_count:0};
        if(cid===POLITICAL_CHANNEL_ID && !String(managed.niche||"").includes("وجهة القناة قيد التحقق")){
          const found=await call("managed_political_news",{channel_id:cid});
          news={checked:true,new_count:Number(found.saved_new_count||0),feeds:found.feed_status||[]};
        }
        let draft:any={created:false,reason:"not-needed"};
        if(cid===CHANNEL_ID){const recent=await db("zoz_pro_content_scripts?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&created_at=gte."+encodeURIComponent(new Date(Date.now()-20*3600000).toISOString())+"&select=id,title&order=created_at.desc&limit=1");if(!Array.isArray(recent)||!recent.length){const until=new Date(Date.now()+86400000).toISOString().slice(0,10);const calRows=await db("zoz_pro_content_calendar?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&status=eq.draft&planned_date=lte."+encodeURIComponent(until)+"&select=id,working_title&order=planned_date.asc,sequence_no.asc&limit=1");if(Array.isArray(calRows)&&calRows[0]){const made=await call("studio_generate",{channel_id:cid,topic:calRows[0].working_title,calendar_id:calRows[0].id,mode:"short",duration_seconds:45});draft={created:true,title:made.script&&made.script.title||calRows[0].working_title,script_engine:made.script_engine||made.method||"template"};}else draft={created:false,reason:"no upcoming draft calendar item"};}else draft={created:false,reason:"recent draft exists",title:recent[0].title};}
        if(cid===FEKRA_CHANNEL_ID){const recent=await db("zoz_pro_content_scripts?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&created_at=gte."+encodeURIComponent(new Date(Date.now()-20*3600000).toISOString())+"&select=id,title,generation_method&order=created_at.desc&limit=1");if(!Array.isArray(recent)||!recent.length){const calRows=await db("zoz_pro_managed_channel_content_calendar?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&select=working_title&status=eq.draft&order=planned_date.asc&limit=1");const topic=String(calRows&&calRows[0]&&calRows[0].working_title||"اختبار عملي لأداة ذكاء اصطناعي مفيدة");const made=await call("studio_generate",{channel_id:cid,topic,mode:"short",duration_seconds:45});draft={created:true,title:made.script&&made.script.title||topic,script_engine:made.script_engine||made.script&&made.script.generation_method||"template"};}else draft={created:false,reason:"recent draft exists",title:recent[0].title};}
        if(cid===POLITICAL_CHANNEL_ID && !String(managed.niche||"").includes("وجهة القناة قيد التحقق")){const approved=await db("zoz_pro_managed_channel_recommendations?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&status=eq.approved&select=id,title,evidence&order=updated_at.desc&limit=1");if(Array.isArray(approved)&&approved[0]&&approved[0].evidence&&approved[0].evidence.editor_verified_by_owner===true){const recent=await db("zoz_pro_content_scripts?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(cid)+"&created_at=gte."+encodeURIComponent(new Date(Date.now()-20*3600000).toISOString())+"&select=id,title&order=created_at.desc&limit=1");if(!Array.isArray(recent)||!recent.length){const made=await call("studio_generate",{channel_id:cid,topic:approved[0].title,news_item_id:approved[0].id,mode:"short",duration_seconds:45});draft={created:true,title:made.script&&made.script.title||approved[0].title,script_engine:made.script_engine||"template"};}else draft={created:false,reason:"recent draft exists"};}else draft={created:false,reason:"political news requires owner verification first"};}
        channelRuns.push({channel_id:cid,ok:true,display_name:managed.display_name,views:synced.metrics&&synced.metrics.views!=null?synced.metrics.views:null,snapshot_id:synced.snapshot_id||null,video_count:synced.video_count==null?null:synced.video_count,calendar,news,draft});
      }catch(err){
        channelRuns.push({channel_id:cid,ok:false,display_name:managed.display_name,error:(err instanceof Error?err.message:"Channel automation failed").slice(0,300)});
      }
    }
    const details={start_date:startDate,end_date:endDate,snapshot_id:saved.snapshot_id,video_count:saved.video_count,analytics_video_count:saved.analytics_video_count,recommendations_generated:saved.recommendations_generated,managed_channel_runs:channelRuns,managed_channels_succeeded:channelRuns.filter((x:any)=>x.ok).length,managed_channels_failed:channelRuns.filter((x:any)=>!x.ok).length};
    if(runId) await db("zoz_pro_automation_runs?id=eq."+encodeURIComponent(runId),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"succeeded",finished_at:new Date().toISOString(),details})});
    return json({ok:true,workflow:"daily_youtube_analytics",channel_id:CHANNEL_ID,...details,message:"Daily channel-scoped analytics, calendar initialization, and political news discovery completed. Videos are never auto-published by this workflow."});
  } catch(e) {
    const message=e instanceof Error?e.message:"Scheduled analytics failed.";
    if(runId) await db("zoz_pro_automation_runs?id=eq."+encodeURIComponent(runId),{method:"PATCH",headers:{prefer:"return=minimal"},body:JSON.stringify({status:"failed",finished_at:new Date().toISOString(),details:{error:message.slice(0,500),start_date:startDate,end_date:endDate}})}).catch(()=>null);
    return fail(message,502);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info, x-zoz-intake-token", "access-control-allow-methods": "POST, OPTIONS" } });
  const url = new URL(req.url);
  if (req.method !== "POST") return fail("Use POST. OAuth callback is handled by the separate callback function.", 405);
  const action=url.searchParams.get("action")||"";
  if (action === "internal_validate") {
    const u = await owner(req);
    return u ? json({ok:true}) : fail("Internal automation authentication failed.",401);
  }
  if (action === "autopilot_run") return await runAutopilot(req);
  if (action === "live_monitor_run") return await runLiveMonitor(req);
  if (action === "autopilot_handoff") return await runAutopilotHandoff(req);
  const intakeActions=["intake_create","intake_signed_part","intake_upload_part","intake_part_done","intake_finalize","intake_status","intake_list","intake_review","intake_source_create","intake_source_list","intake_source_revoke","intake_vidiq_import","intake_start_youtube","intake_youtube_part","intake_check_processing","intake_publish","intake_archive"];
  let u=await owner(req);
  if(!u && intakeActions.includes(action))u=await intakeAuth(req);
  if(!u)return fail("Owner authentication or a valid approved-center token is required.",401);
  if(action==="ai_status"){const keys=[["zoz_pro_primary","GEMINI_API_KEY"],["zoz_now","GEMINI_API_KEY_ZOZ_NOW"],["zoz_manager","GEMINI_API_KEY_ZOZ_MANAGER"],["zoz_hazem","GEMINI_API_KEY_ZOZ_HAZEM"]].filter(([slot,name])=>Boolean(Deno.env.get(name)));return json({ok:true,claude_configured:Boolean(Deno.env.get("ANTHROPIC_API_KEY")||Deno.env.get("CLAUDE_API_KEY")),gemini_configured:keys.length>0,gemini_available_keys_count:keys.length,gemini_key_slots:keys.map(([slot])=>slot),gemini_model:"gemini-3.5-flash-lite",fallback:"local-template",note:"الأسماء فقط؛ لا تُعرض قيم الأسرار. تُجرّب المفاتيح بالتتابع عند فشل الطلب."});}
  if(action==="managed_channels")return await listManagedChannels(u);
  if(action==="managed_channel_dashboard")return await managedChannelDashboard(u);
  if(action==="automation_history")return await automationHistory(u);
  if(action==="managed_channel_connect")return await managedChannelConnect(req,u);
  if(action==="managed_channel_sync")return await managedChannelSync(req,u);
  if(action==="managed_political_news")return await managedPoliticalNews(req,u);
  if(action==="managed_political_news_list")return await managedPoliticalNewsList(req,u);
  if(action==="managed_political_news_review")return await managedPoliticalNewsReview(req,u);
  if(action==="managed_channel_calendar")return await managedChannelCalendar(req,u,false);
  if(action==="managed_channel_calendar_generate")return await managedChannelCalendar(req,u,true);
  if(action==="managed_channel_update_video")return await managedChannelUpdateVideo(req,u);
  if(action==="managed_channel_set_privacy")return await managedChannelSetPrivacy(req,u);
  if(action==="managed_channel_snapshots"){const b=await req.json().catch(()=>({}));const channelId=String(b.channel_id||"");const known=await db("zoz_pro_managed_channels?owner_id=eq."+encodeURIComponent(u.id)+"&channel_id=eq."+encodeURIComponent(channelId)+"&select=channel_id&limit=1");if(!known?.[0])return fail("القناة غير مسجلة لهذا المالك.",404);return json({ok:true,snapshots:await listManagedChannelSnapshots(u,channelId)});}

  if(u.is_intake_source && !["intake_create","intake_signed_part","intake_part_done","intake_finalize","intake_status"].includes(action))return fail("Approved-center tokens can only create and upload intake files.",403);
  if(action==="intake_create")return await intakeCreate(req,u);
  if(action==="intake_signed_part")return await intakeSignPart(req,u);
  if(action==="intake_upload_part")return await intakeUploadPartDirect(req,u);
  if(action==="intake_vidiq_import")return await intakeImportVidiq(req,u);
  if(action==="intake_part_done")return await intakePartDone(req,u);
  if(action==="intake_finalize")return await intakeFinalize(req,u);
  if(action==="intake_status")return await intakeStatus(req,u);
  if(action==="intake_list")return await intakeList(req,u);
  if(action==="intake_review")return await intakeReview(req,u);
  if(action==="intake_source_create")return await intakeSourceCreate(req,u);
  if(action==="intake_source_list")return await intakeSourceList(req,u);
  if(action==="intake_source_revoke")return await intakeSourceRevoke(req,u);
  if(action==="intake_start_youtube")return await intakeStartYoutube(req,u);
  if(action==="intake_youtube_part")return await intakeYoutubePart(req,u);
  if(action==="intake_check_processing")return await intakeCheckProcessing(req,u);
  if(action==="intake_publish")return await intakePublish(req,u);
  if(action==="intake_archive")return await intakeArchive(req,u);
  if(action==="studio_generate")return await localContentStudio(req,u);
  if(action==="studio_list")return await listLocalContentStudio(req,u);
  if(action==="vidiq_account_save"){
 const b=await req.json().catch(()=>({}));
 const accountKey=String(b.account_key||"");
 const secret=String(b.api_key||"");
 if(!VIDIQ_ACCOUNT_SLOTS.some(x=>x.key===accountKey))return fail("Unknown vidIQ account slot.",400);
 if(secret.length<16||secret.length>4096)return fail("مفتاح vidIQ غير صالح.",400);
 try{await vidiqSaveAccountSecret(u.id,accountKey,secret);return json({ok:true,account_key:accountKey,configured:true,message:"تم حفظ المفتاح مشفرًا في Vault. جارٍ التحقق من الحساب."});}
 catch(e){return fail(e instanceof Error?e.message:"تعذر حفظ مفتاح الحساب.",500);}
}
if(action==="vidiq_status"||action==="vidiq_accounts_status")return await vidiqStatus(req,u);
  if(action==="vidiq_research")return await vidiqResearch(req,u);
  if(action==="vidiq_research_runs")return await vidiqResearchRuns(u);
  if (action === "connect") return await connect(u);
  if (url.searchParams.get("action") === "analytics") return await report(req);
  if (url.searchParams.get("action") === "videos") return await listVideos(u);
  if (url.searchParams.get("action") === "video_analytics") return await videoAnalytics(req);
  if (url.searchParams.get("action") === "save_snapshot") return await saveAnalyticsSnapshot(req);
  if (url.searchParams.get("action") === "history") return await analyticsHistory(req);
  if (url.searchParams.get("action") === "recommendations") return await listRecommendations(req);
  if (url.searchParams.get("action") === "review_recommendation") return await reviewRecommendation(req);
  if (url.searchParams.get("action") === "content_calendar") return await getContentCalendar(req);
  if (url.searchParams.get("action") === "generate_content_calendar") return await generateContentCalendar(req);
  if (url.searchParams.get("action") === "review_calendar_item") return await reviewContentCalendarItem(req);
  if (url.searchParams.get("action") === "update_video") {
    const body = await req.json().catch(() => ({}));
    return await updateVideo(u, body);
  }
  if (url.searchParams.get("action") === "set_thumbnail") return await setThumbnail(req, u);
  return fail("Unknown action. Use ?action=connect, ?action=analytics, ?action=videos, ?action=update_video, or ?action=set_thumbnail.", 404);
});
