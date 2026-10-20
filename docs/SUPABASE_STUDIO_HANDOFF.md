# ZOZ Pro Supabase-owned studio

## Architecture
- Static Arabic UI: studio.html, studio.css, studio.js. GitHub Pages deployment uses GitHub Actions; no Render, no Vercel runtime, no Floot daily build quota.
- Supabase project: vjnwojrqduoxhetutxrs. Edge functions: zoz-pro-studio (owner status, OAuth, integration tests and direct upload), zoz-pro-content-center (content jobs and scripts), zoz-pro-video-engine (video generation request).
- Make and Runway are optional only.

## Required one-time OAuth setup
Set these as Supabase Edge Function secrets, never in GitHub or browser storage: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET. For Claude also set ANTHROPIC_API_KEY. Confirm GEMINI_API_KEY exists and has API/model access.

Register exact redirect URIs:
- YouTube: https://vjnwojrqduoxhetutxrs.supabase.co/functions/v1/zoz-pro-studio?action=oauth_callback&platform=youtube
- TikTok: https://vjnwojrqduoxhetutxrs.supabase.co/functions/v1/zoz-pro-studio?action=oauth_callback&platform=tiktok

Enable YouTube Data API v3 and the youtube.upload scope in Google Cloud. TikTok must approve video.upload/video.publish for the app; public posting may require app audit. These provider-console approvals cannot be completed by source code alone.

## Security
Only the Supabase publishable/anon key is present in the public UI. Provider tokens are stored in zoz_pro_channel_tokens with RLS enabled and client roles revoked. The edge function validates the confirmed owner account hazemnaw48@gmail.com. Uploads are private / SELF_ONLY by default. An accepted upload is not reported as publicly published.
