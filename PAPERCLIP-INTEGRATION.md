# ZOZ Pro × Paperclip — Integration and Go-Live Plan

**Status: design staged; Paperclip instance not installed or connected.**  
This document is deliberately separate from production runtime code. It does not claim that Paperclip agents are running.

## Objective

Use Paperclip as the company control plane for the agreed ten-agent ZOZ Pro organization: goals, reporting lines, assignment, budgets, approval gates, task history, and run accountability. Keep Supabase as the business data store and agent execution backend. Do not make Paperclip a replacement for the existing ZOZ Pro channel, KDP, or production databases.

## Confirmed current production facts (2026-11-03)

- Supabase production project: oxyzxbkwhafzaztraowc; organization plan: Free.
- The organization currently has two active projects: production oxyzxbkwhafzaztraowc and preview vjnwojrqduoxhetutxrs. Do not assume a third free project is available.
- Ten ZOZ departments and ten agent records exist. All ten agent records currently point to the same runtime reference, zoz-company-agent-v7; an active database status is a registration flag, not proof of a running independent process.
- The deployed zoz-company-agent Edge Function is v7. Its supported actions are status, enqueue_task, review_task, and run_next. It currently authenticates the owner's Supabase session and uses Gemini direct inference.
- Ten company tasks were still queued at the audit point; no company-task execution record was associated with them.
- The database contains 111 historical succeeded run rows, but their task_id is null, their token usage is unrecorded, and they all carry the same generic summary from zoz_pro_automation_runs. They must not be presented as 111 completed company tasks.
- The model registry has one enabled Gemini primary entry whose latest status is ready (model gemini-3.5-flash-lite). The three named Gemini account rows exist but remain not_tested.
- Qwen accounts are not registered/tested. Claude is disabled and has no verified API secret.
- The connector catalogue marks Canva, GitHub, Notion, Runway, Supabase, and vidIQ as connected at the integration-account level. That does not mean the agents can call them: the current agent access matrix enables Gemini draft access, while the other connector permissions are disabled. Make is optional and currently needs credentials.
- Paperclip is catalogued as needs_install; there is no Paperclip server URL, company ID, agent IDs, API key, or webhook secret configured.

## Agreed ten-agent organization

Use one CEO as the root and the remaining nine agents as direct reports initially. Re-parenting can follow once team managers are justified by actual workload.

| Agent key | Paperclip display role | Initial responsibility |
| --- | --- | --- |
| ceo | CEO / المدير التنفيذي | Company priorities, plans, delegation, review |
| research_lead | Research Lead | Evidence-based research and opportunity analysis |
| content_producer | Content Producer | Channel-specific scripts, production briefs and content experiments |
| digital_product_manager | Digital Product Manager | Digital product design and validation |
| publishing_manager | Publishing Manager | KDP/book preparation and publishing checklists |
| services_manager | Services Manager | Service catalogues, scopes, SOPs and delivery standards |
| software_engineer | Software Engineer | ZOZ software, integration code, tests and release preparation |
| sales_agent | Sales & Marketing | Organic acquisition, offers and measurable funnel experiments |
| finance_controller | Finance Controller | Revenue/cost ledgers, margins and risk reporting |
| operations_qa | Operations & QA | Quality gates, run verification, incidents and operating procedures |

## Target architecture

1. **Paperclip control plane:** owns the org chart, goals, tasks, assignment, approvals, budgets, and audit trail.
2. **ZOZ execution plane:** Supabase Edge Functions and the specialized runtimes perform actual work. Paperclip's HTTP adapter is the intended remote bridge from a Paperclip heartbeat to a protected ZOZ worker endpoint.
3. **Supabase business data:** remains the source of truth for channels, analytics, books, assets, model-account registry, and ZOZ-specific operational data.
4. **Model routing:** start with the already tested primary Gemini connection. Add per-account Gemini and Qwen routing only after each secret is present and each account passes an individual API test. Do not claim that multiple keys multiply provider quotas.
5. **Connected tools:** give agents per-tool access only after an execution handler exists, its OAuth/API connection is verified, and its permissions are deliberately enabled. An account-level MCP connection by itself is not a callable agent tool.

## Paperclip hosting requirements and constraints

Paperclip is a self-hosted Node server/control plane, not a Supabase Edge Function and not a model host. The current Paperclip repository manifest requires Node.js 24.11.0 or newer. It uses PostgreSQL through Drizzle and its documentation explicitly supports hosted PostgreSQL such as Supabase.

A stable Paperclip instance therefore needs:
- an always-on Node.js 24.11+ host capable of running the Paperclip server;
- a PostgreSQL database and a durable storage location;
- deployment secrets managed outside the repository (including the Paperclip secrets encryption key);
- authenticated deployment mode for any network-accessible instance (never expose a local-trusted instance publicly).

The Supabase organization is currently on the Free plan and already has two active projects. Do not provision a paid server, a third database project, or a new subscription without checking its exact cost and receiving owner approval. Reusing the preview database is a separate design choice: it needs a database connection credential and migration-isolation review first; it is not approved by this document.

## HTTP worker bridge contract

Paperclip's documented http adapter sends a POST body containing runId, agentId, and context (including a task/issue identifier). It supports custom headers and a payload template. At the current documentation snapshot, the http adapter must be configured through the Paperclip API or a company export because it is not selectable from the agent configuration UI.

Planned bridge:
- Add a separate Supabase Edge Function endpoint, e.g. zoz-paperclip-worker; do not weaken the existing owner-session route.
- Authenticate every webhook with a dedicated high-entropy shared secret; keep the value only in Supabase Secrets and Paperclip's protected configuration.
- Validate runId, agentId, company/agent mapping, and task identifier before execution.
- Make dispatch idempotent by Paperclip runId so retries do not run the same task twice.
- Use the Paperclip API only for authorized callbacks/comments/status updates, with a dedicated least-privilege agent token where required.
- Return an accepted/success response only after the worker has accepted the run; store result evidence and failures separately.
- Record Paperclip run ID, Paperclip agent ID, ZOZ agent key, task ID, provider, account alias (never the secret), model, timing, token usage if supplied, and outcome.
- Keep external publishing, paid spend, account changes, customer outreach, and destructive actions behind explicit owner approval.

## Go-live sequence

1. Select and provision an always-on Node host without committing to recurring spend; verify Node 24.11+ and secure access.
2. Decide whether the existing preview Supabase project is an acceptable dedicated Paperclip database, or use another separately approved database. Obtain the database URL through the Supabase dashboard; never commit it.
3. Install Paperclip, enable authenticated/private access for initial setup, create the ZOZ Pro company and its goal, then create the CEO and nine reports.
4. Configure the HTTP adapter on each Paperclip agent to target the protected ZOZ worker endpoint. Create the shared webhook secret in both secret stores.
5. Implement and deploy the isolated worker bridge, including idempotency and Paperclip callback behavior; test one non-destructive Operations QA task first.
6. Reconcile Paperclip task IDs with ZOZ task IDs and prove that a task is assigned, claimed, executed by a real model request, and returned with a verifiable result and run record.
7. Enable the other departments in a controlled sequence. Only then allow recurring heartbeats.
8. Test each Gemini account and each Qwen account individually; update model registry and account events from measured outcomes.
9. Enable specific tool permissions only when each tool's runtime handler is tested end-to-end. Keep existing connected integrations disabled for agents until then.
10. Preserve owner approval for publication and other high-impact external actions.

## Current blocker / exact next step

Paperclip cannot be marked installed or start its ten agents until an always-on Node host is selected and provisioned. Supabase can provide its PostgreSQL database, but Supabase Edge Functions cannot host the Paperclip Node control plane itself. No paid host or new project is authorized by this plan.

## Official references

- [Paperclip deployment overview](https://docs.paperclip.ing/reference/deploy/overview/)
- [Paperclip PostgreSQL / Supabase database setup](https://docs.paperclip.ing/reference/deploy/database/)
- [Paperclip HTTP adapter contract](https://docs.paperclip.ing/reference/adapters/http/)
- [Paperclip Agents API](https://docs.paperclip.ing/reference/api/agents/)
- [Paperclip repository package manifest](https://github.com/paperclipai/paperclip/blob/master/package.json)
