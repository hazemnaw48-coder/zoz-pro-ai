# ZOZ Intelligence — Operating Standard & Commercial Closeout

Date: 2026-11-23
Status: Preview pilot; not released to Production or customers.

## Permanent operating decision
ZOZ Intelligence is a core company function, not a standalone chatbot or a search-only page. It owns:
1. Grounded research and evidence collection.
2. Market, competitor, customer, and prospect discovery.
3. Problem diagnosis and solution comparison.
4. Action plans with owners, prerequisites, cost/risk, and acceptance checks.
5. Handoff of approved tasks to the responsible ZOZ department/agent.
6. Verification of external outcomes before recording completion.
7. Research history, evidence, decisions, execution events, and outcome records.

Success is measured by evidence quality, decision usefulness, verified outcomes, qualified opportunities, and business value — not raw result count.

## Required workflow
Intake -> classify objective -> research current primary sources -> preserve source URLs and publication dates -> extract facts -> distinguish inference/unknowns -> compare options -> recommend one course with rationale -> create task/handoff -> obtain required approval -> execute through a connected authorized adapter -> independently verify result -> update task and audit trail -> report cost and outcome.

A research run is not an execution. A queued task is not an execution. A provider HTTP 200 is not proof of the business outcome. Never mark external work complete without a verifiable receipt, platform object ID/URL, state read-back, or equivalent evidence.

## Research quality rules
- Prefer original/official sources, current documents, regulator/company pricing pages, and direct first-party records.
- For commercial research, record source URL, source title, publisher, publication/updated date, access date, geography, and which claim it supports.
- Label every material statement as Fact, Inference, Estimate, or Unknown.
- Keep conflicting sources visible and explain which source is more authoritative/current.
- Do not invent prospects, buyer names, budgets, prices, demand, API access, or execution status.
- Do not treat a market-level survey as proof that a named company intends to buy.
- Prospect records require a public evidence trail and a reason for fit. Contact details must be public business channels, not guessed personal information.
- Score evidence quality separately from relevance and commercial fit. Source-count/domain-diversity heuristics are not factual accuracy checks.

## Initial Egypt go-to-market mission
Build a prospect pipeline for the Arabic-first ZOZ company operating platform.
Initial segments:
1. Digital marketing and social-media agencies.
2. E-commerce operators and brands.
3. Customer-support/BPO operations.
4. Software/services consultancies as a secondary segment.

For each prospect, collect:
- Legal/trading name and official website or verifiable public profile.
- Segment and operating evidence.
- Why ZOZ could solve a specific workflow problem.
- Publicly listed decision-maker role or public business contact route (never guess a person/email).
- Relevant source URLs and dates.
- Qualification status: unreviewed / researched / qualified / contacted-with-approval / meeting / pilot / paid / disqualified.
- Next action, owner, due date, and outcome evidence.

First milestone: 30 researched companies, each with a source trail and fit rationale. This is a research target, not a claim that 30 buyers exist. No outreach is sent until owner approval.

## Department integration contract
Intelligence may create a structured proposed task for:
- Sales/CRM: prospect and follow-up records.
- Marketing: segment-specific messaging, content briefs, and campaign plans.
- Operations: diagnostic and process-improvement tasks.
- Product/engineering: reproducible issue reports and acceptance criteria.
- Finance: cost models and unit economics.

Each task must include source run ID, objective, evidence, expected output, responsible department/agent, required permissions, approval level, estimated cost, deadline, verification method, and rollback/stop condition. A department adapter must explicitly acknowledge the task; do not claim an integration exists merely because a department is named.

## Approval and safety boundaries
- Research and draft preparation may run under owner authorization.
- Sending email/WhatsApp/DM, publishing, ad spend, purchases, financial actions, account changes, or destructive actions require explicit approval and a scoped adapter.
- Never collect passwords, session cookies, or raw secret values in prompts.
- Secrets stay server-side. Customer data must be tenant-isolated before SaaS release.
- Keep customer-private sources separate from public web research and honor each provider's terms and granted scopes.
- Maintain append-only audit events for approvals, executions, failures, and verification.

## Verified current implementation state (2026-11-23)
- Preview project: vjnwojrqduoxhetutxrs (ACTIVE_HEALTHY).
- Production project: oxyzxbkwhafzaztraowc (must remain unchanged during this pilot).
- Preview Edge Function zoz-intelligence-engine: ACTIVE v2; verify_jwt=false, but function body checks a valid Supabase bearer session and owner email before handling requests. Security review must independently validate this gate and reject unauthenticated/non-owner requests.
- Preview Edge Function zoz-intelligence-ui: ACTIVE v1. User reported raw source/code rendering instead of a usable UI. Treat UI as a failed acceptance gate until tested in an actual mobile browser and corrected.
- Preview tables zoz_intelligence_runs and zoz_intelligence_events exist; RLS and owner-scoped SELECT policies were observed.
- Current API uses Gemini Interactions API with Google Search grounding and stores sources, queries, evidence level, usage metadata, and execution_status=not_executed.
- Evidence level is currently a heuristic based on source count/domain diversity; it does not establish factual correctness.
- PR #87 is open, draft, unmerged. Feature branch feat/intelligence-solution-engine. No Production migration/function or main-branch navigation change is authorized by this status.
- Live authenticated search, Gemini secret availability, citation quality, mobile rendering, and negative-auth tests remain unverified.
- No department execution handoff, prospect CRM sync, multi-tenant customer isolation, customer quotas, or commercial release is verified.

## Required closeout gates — do not skip
### Gate A — secure functional research
- Confirm server-side provider secret exists by presence only; never print its value.
- Test unauthenticated, invalid-session, non-owner, and owner requests.
- Confirm a live owner query returns real citations and a persisted run.
- Confirm failure is persisted as failed; never fabricate a result.
- Test history scoping and RLS using at least two distinct test identities before multi-user enablement.

### Gate B — user experience and company navigation
- Fix the UI raw-code rendering defect.
- Test Arabic RTL layout and mobile viewport on a real browser.
- Integrate a working Intelligence entry in the company center on the feature branch.
- Do not direct the owner to the broken Edge Function UI URL again.

### Gate C — research benchmark
- Run 20–30 benchmark tasks across Egypt market research, competitor pricing, technical troubleshooting, operational workflows, and marketing.
- Score source authority/freshness, claim-to-source support, factual accuracy, uncertainty handling, usefulness, and cost.
- Require human review for weak or contradictory evidence.
- Add budget/quota limits and usage reporting before repeated or commercial use.

### Gate D — execution handoff
- Define a typed task contract and department/agent capability registry.
- Start with low-risk internal tasks and dry-run mode.
- Add approval gates, idempotency, retries, cancellation, and audit trail.
- Verify each outcome using the destination system's read-back; never treat dispatch as completion.

### Gate E — Egypt customer validation
- Research 30 companies with evidence and segment fit.
- Interview at least 10 relevant owners/operations/marketing decision-makers.
- Record current tools, top recurring workflow pain, cost/time impact, buying authority, budget range (only if volunteered), and willingness to pilot/pay.
- Seek 3 design partners and at least 1 paid pilot before claiming product-market validation.
- Keep prospect outreach drafts only until owner approval.

### Gate F — commercial readiness
- Complete tenant isolation and access-control tests.
- Complete backup/restore, data export/deletion, incident/audit, privacy and provider disclosure.
- Define plan limits, AI/search usage budgets, storage/video pass-through charges, support obligations, and gross-margin model.
- Validate onboarding with a fresh company tenant.
- Do not enable paid subscriptions or public customer onboarding until gates A–F are signed off.

## First 30-day operating plan
Days 1–5: fix UI and authenticated smoke; establish run/usage telemetry and benchmark rubric.
Days 6–10: execute 20–30 research benchmark tasks; improve evidence handling; create the 30-prospect research pipeline.
Days 11–17: conduct 10 decision-maker interviews; record objections and current workflow costs; refine the first offer.
Days 18–23: prepare tailored demos for the best-fit segment; run approved demos; create pilot scopes and success metrics.
Days 24–30: seek design-partner commitments and paid-pilot evidence; calculate unit economics; make a go/no-go decision for the next segment.

## Marketing measurement
Track qualified prospects, verified contact routes, decision-maker conversations, discovery calls, demos, pilot starts, paid pilots, conversion, time-to-value, retained usage, support burden, AI/search cost per tenant, gross margin, and verified customer outcomes. Followers, impressions, raw leads, and generated reports are not substitutes for commercial conversion.

## Release policy
This standard is a durable product/operating decision. It does not itself authorize merging PR #87, changing Production, sending outreach, spending on ads, activating billing, or onboarding customers. Each gate requires recorded evidence and owner release approval.
