create table if not exists public.zoz_intelligence_runs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 run_type text not null check(run_type in ('research','solve','market','marketing')),
 request text not null check(char_length(btrim(request)) between 8 and 5000), context jsonb not null default '{}'::jsonb,
 status text not null default 'queued' check(status in ('queued','searching','completed','needs_review','blocked','failed')),
 result_markdown text, diagnosis text, solution_steps jsonb not null default '[]'::jsonb, sources jsonb not null default '[]'::jsonb,
 search_queries jsonb not null default '[]'::jsonb, search_entry_point text, grounding_metadata jsonb not null default '{}'::jsonb,
 evidence_level text not null default 'insufficient' check(evidence_level in ('strong','partial','insufficient')),
 execution_status text not null default 'not_executed' check(execution_status in ('not_executed','handoff_queued','executed','blocked')),
 handoff_task_id uuid, model text, usage_metadata jsonb not null default '{}'::jsonb, error_message text,
 created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz, updated_at timestamptz not null default now()
);
create index if not exists zoz_intelligence_runs_owner_created_idx on public.zoz_intelligence_runs(owner_id,created_at desc);
create table if not exists public.zoz_intelligence_events (
 id uuid primary key default gen_random_uuid(), run_id uuid not null references public.zoz_intelligence_runs(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade, event_type text not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index if not exists zoz_intelligence_events_run_created_idx on public.zoz_intelligence_events(run_id,created_at asc);
alter table public.zoz_intelligence_runs enable row level security;
alter table public.zoz_intelligence_events enable row level security;
grant select on public.zoz_intelligence_runs to authenticated;
grant select on public.zoz_intelligence_events to authenticated;
drop policy if exists zoz_intelligence_runs_owner_read on public.zoz_intelligence_runs;
create policy zoz_intelligence_runs_owner_read on public.zoz_intelligence_runs for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists zoz_intelligence_events_owner_read on public.zoz_intelligence_events;
create policy zoz_intelligence_events_owner_read on public.zoz_intelligence_events for select to authenticated using(owner_id=(select auth.uid()));
comment on table public.zoz_intelligence_runs is 'Preview-only research runs. Server writes; owner-scoped reads. Research never implies execution.';
