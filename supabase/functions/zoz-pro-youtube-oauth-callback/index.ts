import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
function defaultKey(envName: string): string {
  try {
    const parsed = JSON.parse(Deno.env.get(envName) || "{}");
    return typeof parsed?.default === "string" ? parsed.default : "";
  } catch { return ""; }
}
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || defaultKey("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SECRET_KEY") || "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") || "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";
const CALLBACK_URL = SUPABASE_URL + "/functions/v1/zoz-pro-youtube-oauth-callback";
const CHANNEL_ID = "UCIael48cvwPG3gKj--c7HKw";
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

function response(message: string, status = 200) {
  const title = status >= 400 ? "Authorization not completed" : "Authorization complete";
  return new Response("<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><title>ZOZ Pro</title><main style='font:18px system-ui;max-width:640px;margin:8vh auto;padding:24px'><h2>" + title + "</h2><p>" + message + "</p><p>You may close this page and return to ZOZ Pro.</p></main>", {
    status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}
function fail(message: string, status = 400) { return response(message, status); }
function dbHeaders() {
  const h: Record<string,string> = { apikey: SERVICE_KEY, "content-type": "application/json" };
  if (!SERVICE_KEY.startsWith("sb_secret_")) h.authorization = "Bearer " + SERVICE_KEY;
  return h;
}
async function db(path: string, init: RequestInit = {}) {
  if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Server database configuration is incomplete.");
  const r = await fetch(SUPABASE_URL + "/rest/v1/" + path, { ...init, headers: { ...dbHeaders(), ...(init.headers as Record<string,string> || {}) } });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error("Private database request failed (HTTP " + r.status + ").");
  return d;
}
async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return fail("Google OAuth callback accepts GET requests only.", 405);
  const url = new URL(req.url);
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  const oauthError = url.searchParams.get("error") || "";
  if (!state) return fail("OAuth state is missing.");
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return fail("ZOZ Pro Google OAuth server configuration is incomplete.", 503);
  try {
    const stateHash = await sha(state);
    const stateRows = await db("zoz_pro_youtube_oauth_states?state_hash=eq." + stateHash + "&consumed_at=is.null&expires_at=gt." + encodeURIComponent(new Date().toISOString()) + "&select=state_hash,owner_id&limit=1");
    const stateRow = stateRows?.[0];
    if (!stateRow) return fail("OAuth state expired, was already used, or is invalid. Restart connection from ZOZ Pro.");
    const consumed = await db("zoz_pro_youtube_oauth_states?state_hash=eq." + stateHash + "&consumed_at=is.null&expires_at=gt." + encodeURIComponent(new Date().toISOString()), {
      method: "PATCH", headers: { prefer: "return=representation" }, body: JSON.stringify({ consumed_at: new Date().toISOString() }),
    });
    if (!Array.isArray(consumed) || consumed.length !== 1) return fail("OAuth state was already consumed or expired. Restart connection from ZOZ Pro.");
    if (oauthError || !code) return fail("Google authorization was cancelled or denied.");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: CALLBACK_URL, grant_type: "authorization_code" }),
    });
    const token = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !token.access_token) return fail("Google token exchange failed (HTTP " + tokenResponse.status + "). Check the authorized redirect URI.", 502);

    let pageToken = "";
    let managed = false;
    for (let page = 0; page < 20; page++) {
      const params = new URLSearchParams({ part: "id", mine: "true", maxResults: "50" });
      if (pageToken) params.set("pageToken", pageToken);
      const channelsResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?" + params.toString(), { headers: { authorization: "Bearer " + token.access_token } });
      const channels = await channelsResponse.json().catch(() => ({}));
      if (!channelsResponse.ok) return fail("Could not verify the managed channel (YouTube Data API HTTP " + channelsResponse.status + "). No token was saved.", 403);
      managed = (channels.items || []).some((item: any) => item.id === CHANNEL_ID);
      if (managed || !channels.nextPageToken) break;
      pageToken = String(channels.nextPageToken);
    }
    if (!managed) return fail("The Google account that approved access does not manage the required Hazem Ahmed channel. No token was saved.", 403);

    const grantedScopes = String(token.scope || "").split(" ").filter(Boolean);
    const youtubeScopes = grantedScopes.filter((s: string) => s.startsWith("https://www.googleapis.com/auth/youtube") || s.startsWith("https://www.googleapis.com/auth/yt-analytics"));
    if (!REQUIRED_SCOPES.every(s => grantedScopes.includes(s)) || youtubeScopes.some((s: string) => !REQUIRED_SCOPES.includes(s))) {
      return fail("Google did not grant exactly the required YouTube read-only scopes. No token was saved.", 403);
    }
    const existing = await db("zoz_pro_youtube_analytics_tokens?channel_id=eq." + encodeURIComponent(CHANNEL_ID) + "&owner_id=eq." + encodeURIComponent(stateRow.owner_id) + "&select=refresh_token&limit=1");
    const refreshToken = token.refresh_token || existing?.[0]?.refresh_token || null;
    await db("zoz_pro_youtube_analytics_tokens?on_conflict=channel_id", {
      method: "POST", headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        channel_id: CHANNEL_ID, owner_id: stateRow.owner_id, access_token: token.access_token,
        refresh_token: refreshToken, token_expires_at: new Date(Date.now() + Number(token.expires_in || 3600) * 1000).toISOString(),
        scopes: grantedScopes, status: "active", updated_at: new Date().toISOString(),
      }),
    });
    return response("Google approved read-only access for the verified Hazem Ahmed channel. No videos or channel settings were changed.");
  } catch (error) {
    return fail(error instanceof Error ? error.message : "OAuth callback failed safely.", 500);
  }
});
