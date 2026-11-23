# ZOZ Intelligence — Company Operating Standard

Date: 2026-11-24
Status: Permanent operating rule; Preview integrated pilot; not yet commercially released.

## Permanent mandate
ZOZ Intelligence is the evidence and problem-solving reference for the whole company, not a stand-alone chatbot. The company, departments, and agents must use it to:
1. Discover current facts, sources, customers, opportunities, and problems.
2. Diagnose root causes rather than merely summarize information.
3. Compare feasible solutions and recommend an implementable option.
4. Convert the solution into a task for the responsible department/agent.
5. Keep evidence, source URLs, queries, decisions, costs/assumptions, and status in the company record.
6. Review result quality independently and verify outcomes before declaring completion.

Success means evidence quality, decision usefulness, solved problems, qualified sales opportunities, and verified outcomes — not number of searches or result length.

## Required task lifecycle
Problem intake → grounded research → diagnosis → compare solutions → choose recommended solution → create company task → assign one active specialist → agent builds a practical deliverable → independent QA → store durable memory → specialist handoffs → owner review where required → actual adapter execution where enabled → destination read-back → verified completion.

No agent may bypass the research step for substantive current-market, external, technical, or problem-solving work. If a task already contains a valid Intelligence run linked by ID and its sources/context are available, the agent should reuse it rather than duplicate it. If the evidence is insufficient, it must report the gap and block confident claims.

## Research evidence rules
- Use current Google Search grounding or a more authoritative connected primary source.
- Preserve the source URL, source title, publisher, publication/updated date where exposed, access time, and claim it supports.
- Separate Fact, Inference, Estimate, and Unknown.
- Show source conflicts and choose the most authoritative/current source with rationale.
- Do not invent customers, decision-makers, budgets, prices, product capabilities, integrations, API permissions, or execution results.
- Source count/domain diversity is only a routing heuristic, never proof of factual correctness.
- For business prospecting, require official evidence of company activity, segment fit, public business contact route, and a non-fabricated qualification state.

## Department responsibilities
- Executive: prioritize company goals and resolve dependencies.
- Research: research, diagnose, source, and validate.
- Sales/Marketing: qualify prospects and prepare outreach drafts/funnels.
- Operations/QA: independent evidence and output review, acceptance criteria, and failure diagnosis.
- Software/App Factory: reproducible diagnosis, fixes, tests, and release gates.
- Content/Publishing/Products/Services/Finance: apply evidence to each department's specialist scope and report actual artifacts/outcomes.

## Approval/safety contract
Research and internal drafts may run under owner authorization. External customer contact, publishing, ad activation/spend, purchases, financial actions, account/permission changes, and destructive actions require explicit scoped approval and a verified adapter. A proposed handoff is not an executed action. An acknowledged task is not execution. A successful provider response is not necessarily a business outcome. Do not record external work as completed without a destination receipt/read-back or equivalent evidence.

## Current implementation snapshot
- Preview Intelligence engine v10 and company worker v3 are active in Supabase project `vjnwojrqduoxhetutxrs`.
- The company worker runs Intelligence preflight before specialist reasoning, then performs a separate QA pass and saves output plus operating memory.
- Preview seeded company model contains 15 departments, 15 agents, 3 core tools, and 45 permission grants.
- The integrated Intelligence block is embedded in `channel-control.html`, lets the owner select any of the 15 departments, and uses the existing owner session against the Preview project. The latest Pages workflow for the final worker button was still in progress at last check; confirm deployment success before assuming it is live.
- No Production agent/function/schema was changed. Production autonomous scheduling is not yet wired to the Preview engine.
- No external domain adapter was run by the new worker; its current verified scope is research, diagnosis, internal solution deliverables, QA, memory, and specialist task handoff.

## Closeout gates before commercial/Production activation
1. Owner-authenticated end-to-end test from the real company-center page.
2. Mobile RTL browser test.
3. 20–30 case research/solution benchmark with human adjudication.
4. Department adapter capability registry and least-privilege scopes.
5. Approval, idempotency, retry/cancel, audit, and destination read-back for each execution adapter.
6. Scheduler service-to-service authentication for Intelligence; do not forward anonymous service-role access or use a shared hard-coded token.
7. Tenant isolation and cross-tenant negative tests.
8. Usage budgets/quotas, per-tenant cost accounting, privacy, backup/restore, data export/deletion, incident handling, and independent onboarding test.
9. Egypt customer discovery and pilot evidence before claims of product-market fit.

Until every gate has recorded evidence and owner release approval, keep the integration in Preview; do not alter Production or start public customer onboarding, paid subscriptions, outreach campaigns, or ad spend.
