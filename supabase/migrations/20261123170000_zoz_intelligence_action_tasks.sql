create table if not exists public.zoz_intelligence_tasks (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references public.zoz_intelligence_runs(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,
 department text not null check (department in ('sales','marketing','operations','engineering','finance','research')),
 title text not null,
 objective text not null,
 proposed_steps jsonb not null default '[]'::jsonb,
 evidence jsonb not null default '[]'::jsonb,
 required_permissions text[] not null default '{}',
 approval_required boolean not null default true,
 status text not null default 'proposed' check (status in ('proposed','approved','queued','acknowledged','executing','verified','blocked','cancelled','failed')),
 execution_status text not null default 'not_executed' check (execution_status in ('not_executed','queued','executing','verified','failed')),
 verification_method text not null default 'destination_readback_or_receipt',
 estimated_cost numeric(12,2),
 cost_currency text not null default 'EGP',
 idempotency_key text not null unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 verified_at timestamptz,
 outcome_evidence jsonb not null default '{}'::jsonb
);
create index if not exists zoz_intelligence_tasks_owner_status_idx on public.zoz_intelligence_tasks(owner_id,status,created_at desc);
create index if not exists zoz_intelligence_tasks_run_idx on public.zoz_intelligence_tasks(run_id);
alter table public.zoz_intelligence_tasks enable row level security;
drop policy if exists zoz_intelligence_tasks_owner_select on public.zoz_intelligence_tasks;
create policy zoz_intelligence_tasks_owner_select on public.zoz_intelligence_tasks for select to authenticated using (owner_id = auth.uid());
drop policy if exists zoz_intelligence_tasks_owner_insert on public.zoz_intelligence_tasks;
create policy zoz_intelligence_tasks_owner_insert on public.zoz_intelligence_tasks for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists zoz_intelligence_tasks_owner_update on public.zoz_intelligence_tasks;
create policy zoz_intelligence_tasks_owner_update on public.zoz_intelligence_tasks for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());