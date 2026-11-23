# ZOZ Intelligence — Company Runtime Integration

Status: Preview integrated pilot, 2026-11-24. This is not a customer-facing multi-tenant release.

## Runtime components
- Supabase Preview project: `vjnwojrqduoxhetutxrs`.
- `zoz-intelligence-engine` ACTIVE v10: live Google Search grounding through Gemini Interactions API; owner-authenticated requests; evidence/source/query persistence; task proposal; company-task queue handoff; internal task preflight mode.
- `zoz-company-agent` ACTIVE v3: owner-authenticated company worker; reads a queued department task; invokes the same Intelligence engine before any department reasoning; passes the resulting research and source URLs into the selected agent prompt; runs independent QA; writes the operating-memory checkpoint; records results on the company task and agent run.
- `zoz-intelligence-ui` ACTIVE v3: redirects to the real company center section. HTML is hosted as a static Pages page/embedded section, not served from an Edge Function.
- `channel-control.html` main Pages source now embeds the Arabic Intelligence workspace and invokes the Preview company worker for the exact task returned from the research run.

## Department routing
Intelligence routes its compact labels and all named company-department keys to the existing 15 seeded departments and specialists:
- sales / marketing → sales_marketing / sales_agent
- operations → operations / operations_qa
- engineering → software / software_engineer
- finance → finance / finance_controller
- research → research / research_lead

The dispatcher validates that the department and exactly one active agent exist and match. It records the company task with the source run ID, evidence, queries, and owner context. Duplicate handoffs for the same run are reused.

## Mandatory solve lifecycle
1. Owner enters a problem in the company-center Intelligence block.
2. `zoz-intelligence-engine` searches current sources and saves a research run, source URLs, queries, evidence level, usage metadata, and audit events.
3. Engine creates a row in `zoz_pro_company_tasks` for the selected department and records the Intelligence run ID/evidence in its input.
4. Owner presses **Run department agent** for that exact task.
5. `zoz-company-agent` claims the task and calls Intelligence again in `internal_run` mode if the task has not already been researched. The engine performs/persists the research and attaches it to the parent company task.
6. The active specialist agent builds a diagnosis, proposed solution, practical steps, dependencies, risks, costs/assumptions, success metrics, and any specialist handoffs. It receives the research result and references; it does not substitute model memory for source-grounded evidence.
7. A separate operations/QA reviewer evaluates evidence use, practicality, and unsupported claims.
8. The worker writes the task result, the agent run, and a durable company operating-memory checkpoint.
9. Internal work can be recorded completed only when QA passes (score at least 80, no required fixes), the task policy does not require owner review, and memory read-back succeeds. Otherwise it remains awaiting owner or blocked.
10. Handoffs create child company tasks with deduplication keys. They are not marked complete until processed by their own agent task.

## Execution limits
This Preview worker currently produces verified internal research/diagnosis/solution deliverables and queues specialist follow-up tasks. It does **not** yet execute arbitrary external domain actions. The company worker explicitly reports `external_actions_performed=false`. Public messaging, publishing, ad spend, purchases, account changes, financial activity, or destructive actions remain disabled and require approved, narrowly scoped adapters plus destination read-back before completion can be claimed.

The existing Production company-agent remains unchanged. Scheduled autonomous Production cycles are not wired to this Preview engine. The end-to-end owner-authenticated request from a real session must still be exercised after deployment; this tool session can verify health/configuration/schema and rendered HTML but cannot reuse the owner's browser session.

## Preview data model
Preview was seeded with 15 department records, 15 agent records, 3 visible tools (Gemini, Supabase, ZOZ Intelligence), and 45 agent-tool permission records. Task/run/memory/audit tables are owner-linked. Internal-only company tables have RLS enabled and direct client roles revoked; Edge Functions access them server-side with the service role key. The separate Intelligence user-facing run/task tables retain owner-scoped RLS policies.

## UI and deployment
- Static GitHub Pages is the actual HTML host.
- The old Edge Function HTML endpoint is not used to serve markup; `zoz-intelligence-ui` v3 redirects to the static integrated company-center anchor.
- The latest Pages workflow for the new worker button is run #658 and was in progress at last inspection. Verify a successful completion and live rendered content before treating that commit's UI as released.

## Release gates still open
- Owner-authenticated live search + specific company-agent run from the actual page.
- Verify the full request/response and row read-back under the user's logged-in browser session.
- Mobile viewport interaction test on the user's phone.
- Benchmark 20–30 tasks for source quality and solve quality; compare agent output with independent QA.
- Wire safe department adapters (read/write/draft only first), acknowledgement, retry/cancel, idempotency, destination read-back and audit.
- Scheduler-to-Intelligence integration requires a server-to-server owner-authenticated contract before any autonomous use.
- Multi-tenant customer isolation, budgets/quotas, privacy, export/delete, backup/restore, and onboarding acceptance before SaaS release.

No Production schema, Edge Function, autonomous scheduler, publishing, messaging, or billing change was made as part of this Preview integration.
