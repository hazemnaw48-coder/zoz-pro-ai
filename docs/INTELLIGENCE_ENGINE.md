# ZOZ Intelligence Engine — Preview pilot

## Purpose
Build a grounded research and problem-solving product that starts from a real user objective, searches current web sources, preserves source citations, distinguishes evidence from inference, and produces concrete implementation steps. The product must never describe a proposed or queued action as executed.

## Current pilot scope
- Arabic-first, owner-only internal pilot.
- Four run types: research, problem solving, market/competitor research, and marketing research/plans.
- Gemini Interactions API with Google Search grounding (gemini-3.8-flash).
- Stores requests, results, source citations, search queries, evidence level, usage metadata, and audit events in Preview Supabase only.
- Search UI is served by the Preview Edge Function zoz-intelligence-ui.
- Search API is the Preview Edge Function zoz-intelligence-engine.
- Existing company center navigation receives a link in the Git feature branch.

## Explicit limitations
- This first pilot does not crawl every website or access private platform data without a customer-granted API connection.
- It does not contact prospects, publish content, create ad campaigns, change prices, spend money, or send WhatsApp/email.
- It currently authenticates the ZOZ Pro owner only; it is not a multi-tenant customer release.
- Execution orchestration and outcome verification are separate follow-up work. The database keeps execution_status=not_executed for all search runs.
- Search quality must be validated on a representative benchmark before commercial claims or launch.

## Security
- API and service credentials remain server-side.
- The UI only receives the Preview publishable key.
- Server authenticates the owner using Supabase Auth and performs writes with service credentials.
- RLS is enabled on run and event tables; authenticated users can read only their own rows.
- Production project oxyzxbkwhafzaztraowc is not changed by this pilot.

## Acceptance checklist
1. Edge functions active in Preview.
2. Tables exist with RLS and owner-scoped read policies.
3. Unauthenticated API requests are rejected.
4. Authenticated owner can run a Google-grounded query and see citations.
5. Search failure is persisted as failed; no fabricated success.
6. Each result reports evidence level and execution status.
7. Search history returns only owner rows.
8. Run a 20–30 task benchmark across market, marketing, technical, and operational cases; score source quality, factual accuracy, relevance, and executable usefulness.
9. Verify provider quota/cost and set a budget before any paid-volume launch.
10. Design multi-tenant access, customer consent, API scopes, execution approvals, and verifiable outcomes before SaaS launch.
