-- ZOZ Software Factory schema (Preview project only)
create table if not exists public.zoz_software_products (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 2 and 120),
 slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 description text not null default '',
 stage text not null default 'discovery' check (stage in ('discovery','specification','building','testing','staging','pilot','production','paused','archived')),
 repository_url text, repository_branch text, preview_project_ref text, app_url text, pricing_model text, target_customer text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(owner_id,slug)
);
create table if not exists public.zoz_software_runs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.zoz_software_products(id) on delete cascade,
 run_type text not null check (run_type in ('spec','build','test','security_review','deploy','incident','release')),
 status text not null default 'planned' check (status in ('planned','running','passed','failed','blocked','cancelled')),
 summary text not null, evidence_url text, started_at timestamptz, completed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.zoz_software_quality_gates (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.zoz_software_products(id) on delete cascade,
 gate_key text not null check (gate_key in ('requirements','security','tests','tenant_isolation','backup_restore','staging_acceptance','owner_approval')),
 status text not null default 'pending' check (status in ('pending','passed','failed','waived')),
 evidence text, reviewed_at timestamptz, unique(product_id,gate_key)
);
create table if not exists public.zoz_software_ledger (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 product_id uuid not null references public.zoz_software_products(id) on delete cascade,
 entry_type text not null check (entry_type in ('cost','revenue','refund','asset')),
 amount numeric(14,2) not null check (amount >= 0), currency text not null default 'EGP',
 category text not null, note text not null default '', occurred_on date not null default current_date, created_at timestamptz not null default now()
);
create index if not exists zoz_software_products_owner_stage_idx on public.zoz_software_products(owner_id,stage);
create index if not exists zoz_software_runs_product_created_idx on public.zoz_software_runs(product_id,created_at desc);
create index if not exists zoz_software_gates_product_idx on public.zoz_software_quality_gates(product_id);
create index if not exists zoz_software_ledger_product_date_idx on public.zoz_software_ledger(product_id,occurred_on desc);
alter table public.zoz_software_products enable row level security;
alter table public.zoz_software_runs enable row level security;
alter table public.zoz_software_quality_gates enable row level security;
alter table public.zoz_software_ledger enable row level security;
drop policy if exists zoz_software_products_owner_all on public.zoz_software_products;
create policy zoz_software_products_owner_all on public.zoz_software_products for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
drop policy if exists zoz_software_runs_owner_all on public.zoz_software_runs;
create policy zoz_software_runs_owner_all on public.zoz_software_runs for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
drop policy if exists zoz_software_quality_gates_owner_all on public.zoz_software_quality_gates;
create policy zoz_software_quality_gates_owner_all on public.zoz_software_quality_gates for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
drop policy if exists zoz_software_ledger_owner_all on public.zoz_software_ledger;
create policy zoz_software_ledger_owner_all on public.zoz_software_ledger for all to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id);
revoke all on public.zoz_software_products,public.zoz_software_runs,public.zoz_software_quality_gates,public.zoz_software_ledger from anon;
grant select,insert,update,delete on public.zoz_software_products,public.zoz_software_runs,public.zoz_software_quality_gates,public.zoz_software_ledger to authenticated;
