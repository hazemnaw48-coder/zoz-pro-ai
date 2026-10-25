# ZOZ Pro YouTube Analytics — isolated read-only bridge

This branch contains an isolated integration for the single managed channel
`UCIael48cvwPG3gKj--c7HKw` (Hazem Ahmed / `@hazemelzoz7281`).

## Files
- `supabase/functions/zoz-pro-youtube-analytics/index.ts`: owner-authenticated OAuth connect and date-scoped Analytics read endpoint.
- `supabase/migrations/20261025120000_zoz_pro_youtube_analytics_oauth.sql`: isolated private token/state schema.
- This document: deployment and verification checklist.

## Deployment status
This branch is not deployed. No production or preview database schema, function, secret, token, video, or analytics snapshot was changed as part of the code review. Production must be inspected again immediately before any migration or deployment.

## Required server-side secrets in the production Supabase project
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLISHABLE_KEY` or `SUPABASE_ANON_KEY`

Never copy ZOZ AI / Upload-Post credentials into ZOZ Pro. Never expose these values in browser code or logs.

## Google OAuth client setup
Register this exact authorized redirect URI on the Google OAuth client used by ZOZ Pro:
`https://oxyzxbkwhafzaztraowc.supabase.co/functions/v1/zoz-pro-youtube-analytics`

Request only:
- `https://www.googleapis.com/auth/youtube.readonly`
- `https://www.googleapis.com/auth/yt-analytics.readonly`

The handler requests `openid email` only to support Google consent metadata; it does not treat email identity or a public channel lookup as proof of channel ownership. The OAuth callback checks `channels.list(mine=true)` using the newly granted access token and requires the target channel ID to be in the managed-channel response before saving credentials.

## Request flow
1. The confirmed ZOZ Pro owner sends authenticated POST to `?action=connect`; response contains Google's official consent URL.
2. The owner completes Google consent in the browser.
3. The callback consumes a short-lived one-time state, exchanges the code, verifies the target channel through `mine=true`, verifies the read-only scopes, and then stores the credential in the private table.
4. The owner sends authenticated POST to `?action=analytics` with `channel_id`, `start_date`, and `end_date`.
5. The handler returns daily metrics and traffic-source rows directly from YouTube Analytics API, with dates absent from returned daily rows listed in `missing_dates`. It does not store analytics snapshots or invoke video-write/publishing APIs.

## Security review notes
- The function must be deployed with gateway JWT verification disabled so Google's GET callback can reach it; the function itself validates the confirmed ZOZ Pro owner JWT on both POST actions. The OAuth state is hashed, short-lived, bound to the initiating owner, and consumed atomically.
- The OAuth callback checks managed-channel ownership and exact YouTube/Analytics read-only scopes before persisting tokens. No channel token is saved if the target channel or required scopes are missing.
- If Google omits a new refresh token during re-consent, the callback preserves the existing refresh token for the same channel and owner.
- Analytics requests refresh the access token when near expiry, update only the private credential record, and never return credentials. If refresh fails, reconnect through the official consent flow.
- The SQL migration enables RLS and revokes table access from anon/authenticated roles; only the server-side privileged function should access these tables.
- This draft has not been type-checked, deployed, or live-tested. Review database permissions, secrets, OAuth consent-screen configuration, callback URI, and the exact deployed function version before calling the integration production-ready.
- No PR merge, production migration, deployment, secret configuration, or live Analytics request is implied by this source review.
