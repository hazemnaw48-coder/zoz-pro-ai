# ZOZ Pro YouTube Analytics — isolated draft

This branch contains an un-deployed, read-only integration draft for the single owned channel
`UCIael48cvwPG3gKj--c7HKw` (Hazem Ahmed / `@hazemelzoz7281`).

## Files
- `supabase/functions/zoz-pro-youtube-analytics/index.ts`: independent OAuth and analytics read endpoint.
- `supabase/migrations/20261025120000_zoz_pro_youtube_analytics_oauth.sql`: isolated token/state schema proposal.

## Not deployed
No production or preview function, database schema, secret, or token was changed by this branch. The function cannot work until the migration is reviewed/applied and the Google OAuth client is configured in the *production ZOZ Pro* Supabase project.

## Required server-side Supabase Edge Function secrets
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- existing `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`)
- `SUPABASE_PUBLISHABLE_KEY` (or `SUPABASE_ANON_KEY`)

Do not copy any ZOZ AI token or secret into ZOZ Pro. Register the exact callback URI
`https://oxyzxbkwhafzaztraowc.supabase.co/functions/v1/zoz-pro-youtube-analytics`
in the Google OAuth client. Use only the scopes `youtube.readonly` and `yt-analytics.readonly`.
Do not add the monetary scope unless the owner explicitly requests revenue analytics.

## Request flow
1. Authenticated owner sends POST to `?action=connect`; response contains the official Google consent URL.
2. User grants consent to the read-only scopes.
3. Google returns to the function callback; code verifies the requested channel ID and granted scopes before storing a token.
4. Authenticated owner sends POST JSON to `?action=analytics` with `channel_id`, `start_date`, and `end_date`.
5. Function queries YouTube Analytics API and returns daily rows, period totals, and traffic sources by date. The analytics request does not refresh or write tokens or snapshots.

## Security/limitations before deployment
- This is a draft and has not been type-checked, deployed, or live-tested.
- Verify Supabase project secrets and owner auth configuration before use.
- The callback currently requires Google to return a refresh token; if it does not, a re-consent flow may be needed before saving durable access.
- Validate Google OAuth consent-screen configuration and redirect URI exactly.
- The endpoint intentionally refuses other channel IDs and does not call YouTube Data API write methods.
- Do not apply this migration to production or deploy this function without reviewing the diff and confirming the owner approves the configuration change.
