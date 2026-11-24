# ZOZ Intelligence Preview Database

Preview-only records applied in Supabase project `vjnwojrqduoxhetutxrs`. These entries are not a command to migrate Production.

## Migration history
- `20261123161313_zoz_intelligence_research_solution_engine`
- `20261123161426_zoz_intelligence_engine`
- `20261123163723_zoz_intelligence_action_tasks`
- `20261123232407_zoz_company_agents_intelligence_runtime`
- `20261123233225_zoz_company_agent_service_role_policies`

## Core objects
Intelligence:
- `zoz_intelligence_runs`: search/diagnosis run, sources, queries, evidence level, result, status.
- `zoz_intelligence_events`: audit of research completion, handoff and approval.
- `zoz_intelligence_tasks`: research-linked solution task proposal and owner approval state.

Company model and runtime:
- `zoz_pro_company_departments`: the 15 company departments.
- `zoz_pro_company_agents`: one active specialist agent per seeded department.
- `zoz_pro_company_tasks`: task queue; the originating Intelligence run ID, complete synthesis, citations, search queries and evidence level are stored in `input`.
- `zoz_pro_tool_catalog`: Gemini, Supabase and ZOZ Intelligence tools.
- `zoz_pro_agent_tool_access`: 45 grants enabling these three core tools for the 15 agents.
- `zoz_pro_tool_connections`: owner-scoped connection metadata.
- `zoz_pro_agent_runs`: model execution and QA status.
- `zoz_pro_agent_memory` and `zoz_pro_agent_memory_events`: company operating memory and checkpoints.
- `zoz_pro_tool_gateway_audit`: tool/action audit trail.

## Access model
- Intelligence user-facing runs/tasks have owner-scoped RLS policies.
- Ten internal company-runtime tables have RLS enabled, explicit `service_role`-only policies, and direct privileges revoked for `anon` and `authenticated`.
- Edge Functions authenticate a confirmed owner session and access internal company data server-side. Never expose a service-role/secret key in the browser.
- Supabase security advisor still reports 24 pre-existing RLS-enabled tables without policies and two unrelated warnings (`pg_net` in public and leaked-password protection disabled). These findings were not modified as part of this Preview integration.

## Important boundary
This schema is the isolated Preview operating model. The Production database and production company-agent remain unchanged. Do not apply or replay these Preview seed operations against Production without a separate migration plan, tenant policy review, and explicit owner release approval.
