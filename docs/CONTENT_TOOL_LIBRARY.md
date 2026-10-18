# ZOZ Pro — Content Tool Library

## Operating rule

Whenever the owner asks for help creating content, scripts, video, voice, editing, or publishing, show this same library and current verification states before choosing the next tool. Do not make the owner repeat which tools were previously connected or discussed. Keep the catalog in the Content Factory UI and in this handoff.

## Scope

This catalog is an inventory and launcher, not proof that a provider is authenticated in the production runtime. The UI must distinguish:
- owner-reported connections;
- connectors verified in their specific scope;
- account/quota checks still required;
- actual successful generation, which requires a returned media file and playback check.

Do not call Kling or Luma connected inside ZOZ Pro until an authenticated server-side request and a real generation/status check succeed. Keep web-app credits separate from API credits. Do not expose secrets or request API keys in chat.

## Saved tools

- Google Flow / Video Queue — established manual production path; check account/session and credits.
- Kling AI — owner-reported connected; independent ZOZ Pro test pending.
- Luma Dream Machine — owner-reported connected; independent ZOZ Pro test pending.
- PixVerse — web/API are separate; inspect account quota before use.
- Vidu — web/API are separate; inspect quota and API costs before use.
- Hailuo AI — current account quota/output test pending.
- CapCut AI Video Maker — high-priority manual test for full text-to-video/edit/export flow.
- Runway — ChatGPT connector connected in last check; video model list was empty, so do not count it as an active video generator through that connection.
- Pika — recurring free video quota was not confirmed in the last review.
- Gemini — text planning/assist only in the existing Cloud Run path unless direct media generation is independently verified.
- TTSMaker — speech and Arabic voice checks pending.
- ElevenLabs Studio — check quota and commercial licensing before channel use.
- Canva — design/assets connector; final video export through the connector has not been confirmed.
- Make — Kling/Luma modules were present in the module catalog, but existing account connections were absent at the last check.
- Floot — preserve the existing work; the owner reported daily usage limit exhaustion. Do not rebuild it or return to it as the current repair target.
- TinyFish — browser automation only, not a video generator; check wallet and saved session before use. No top-up or auto-reload without owner approval.
- Publishing — YouTube and TikTok need independent per-platform status/results. Publishing remains approval-gated and is not considered successful without a real published URL.

## Project boundary

Use the existing ZOZ Pro Cloud Run + Supabase alternative. Do not switch the repair target back to Vercel, do not restart the project from scratch, do not reconstruct the existing Floot center, and do not enable billing or paid generation without explicit owner approval.

## Catalog verification fields

For each tool maintain: access mode, current account/session status, credits before and after the test, estimated and actual cost, task ID, final media URL, successful download/playback, duration, dimensions/orientation, Arabic text/voice quality, watermark, and commercial-use rights.

A tool may be presented as “ready for production” only after a real output file has been verified. A listing, public pricing page, MCP server, or owner's connection report is not sufficient by itself.


## Production centers (added 2026-10-18)

The Content Factory has a distinct production-center inventory in addition to the tool catalog. Never combine quota units:
- **Google AI Studio / Video Queue (M4)** — existing primary generation workflow for the Egyptology channel; continue existing tasks and do not regenerate an already published clip. Direct ZOZ Pro automation is not yet proven.
- **Google Flow / Veo** — separate manual video generation center. Google documents 50 Flow credits per day for eligible free users, but these are credits, not GPU hours; peak-hour generation may be unavailable. Check the logged-in account and per-model cost before generating.
- **Floot Alternate Video Production Center** — existing project \`894a0e3a-85c4-43de-b8f7-205db24685b9\`; direct Floot check on 2026-10-18 says unpublished and Free plan. Keep it; do not recreate it.
- **Floot Cloud Runtime** — separate existing project \`e63d1fa8-d477-4708-bed1-e3f539ef224e\`; direct Floot check on 2026-10-18 says published at https://zoz-pro-cloud-runtime.floot.app and Free plan. Published status does not prove all generation/publishing connectors work.
- **Kaggle GPU** — official docs describe up to 30 GPU hours per week, subject to resource availability and account quota. This is compute time, not ready-made video time or Google Flow credits. Before GPU use: verify actual account quota/accelerator, prepare notebook and inputs first, run a short batch, save checkpoints and output files to persistent storage, and stop the session when idle. The previously owner-created Kaggle API token was not verified connected to ZOZ Pro; never paste it into source code or Notion.
- **ZOZ Pro Content Factory** — orchestration and audit record for selecting the right center, task IDs, statuses, cost, output artifact and separate destination outcomes. The catalog itself is not proof of provider authentication or successful generation.

For every center, preserve: current project/account identity, quota unit and reset time, estimated/actual cost, task ID, status, output file URL, download/playback verification, duration/dimensions, watermark, and license. Do not spend credits or enable paid usage without explicit owner approval. The Cloud Run + Supabase alternative remains the target; do not switch back to Vercel, start over, or rebuild the existing Floot projects.
