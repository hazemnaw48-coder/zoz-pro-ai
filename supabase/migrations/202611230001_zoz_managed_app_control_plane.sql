-- ZOZ Managed App Control Plane
-- Applied to production project oxyzxbkwhafzaztraowc; retained here as source-controlled migration.

create table if not exists public.zoz_pro_managed_apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  app_key text not null check (app_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  platform text not null check (platform in ('android','web','ios','desktop','multi')),
  package_name text,
  base_url text,
  adapter_key text,
  lifecycle_status text not null default 'development'
    check (lifecycle_status in ('development','testing','pilot','production','suspended','retired')),
  control_enabled boolean not null default true,
  autonomy_mode text not null default 'guarded'
    check (autonomy_mode in ('manual','guarded','routine_autonomy')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, app_key)
);

create table if not exists public.zoz_pro_managed_app_capabilities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid not null references public.zoz_pro_managed_apps(id) on delete cascade,
  capability_key text not null check (capability_key ~ '^[a-z][a-z0-9_.-]{1,99}$'),
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  description text not null default '',
  risk_level text not null default 'read_only'
    check (risk_level in ('read_only','internal_write','external_action','financial','destructive')),
  approval_required boolean not null default false,
  enabled boolean not null default true,
  input_schema jsonb not null default '{}'::jsonb,
  constraints_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(app_id, capability_key),
  unique(id, app_id, owner_id)
);

create table if not exists public.zoz_pro_managed_app_worker_tokens (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid not null references public.zoz_pro_managed_apps(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'default worker',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.zoz_pro_managed_app_commands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid not null references public.zoz_pro_managed_apps(id) on delete cascade,
  capability_id uuid not null,
  capability_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('awaiting_approval','queued','running','succeeded','failed','cancelled','rejected','expired')),
  approval_required boolean not null default false,
  approval_status text not null default 'not_required'
    check (approval_status in ('not_required','pending','approved','rejected')),
  requested_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  idempotency_key text not null,
  priority smallint not null default 50 check (priority between 0 and 100),
  scheduled_at timestamptz not null default now(),
  expires_at timestamptz,
  lease_expires_at timestamptz,
  lease_token_hash text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique(owner_id, app_id, idempotency_key),
  foreign key (capability_id, app_id, owner_id)
    references public.zoz_pro_managed_app_capabilities(id, app_id, owner_id)
    on delete cascade
);

create table if not exists public.zoz_pro_managed_app_audit (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  app_id uuid references public.zoz_pro_managed_apps(id) on delete set null,
  command_id uuid references public.zoz_pro_managed_app_commands(id) on delete set null,
  actor_type text not null check (actor_type in ('owner','agent','app_worker','system')),
  actor_ref text,
  event_type text not null,
  status text not null default 'recorded',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists zoz_managed_apps_owner_status_idx on public.zoz_pro_managed_apps(owner_id,lifecycle_status);
create index if not exists zoz_managed_caps_app_enabled_idx on public.zoz_pro_managed_app_capabilities(app_id,enabled,capability_key);
create index if not exists zoz_managed_commands_queue_idx on public.zoz_pro_managed_app_commands(app_id,status,scheduled_at,priority);
create index if not exists zoz_managed_commands_owner_idx on public.zoz_pro_managed_app_commands(owner_id,created_at desc);
create index if not exists zoz_managed_audit_owner_idx on public.zoz_pro_managed_app_audit(owner_id,created_at desc);
create index if not exists zoz_managed_tokens_lookup_idx on public.zoz_pro_managed_app_worker_tokens(token_hash) where revoked_at is null;

alter table public.zoz_pro_managed_apps enable row level security;
alter table public.zoz_pro_managed_app_capabilities enable row level security;
alter table public.zoz_pro_managed_app_worker_tokens enable row level security;
alter table public.zoz_pro_managed_app_commands enable row level security;
alter table public.zoz_pro_managed_app_audit enable row level security;

drop policy if exists zoz_managed_apps_owner_read on public.zoz_pro_managed_apps;
create policy zoz_managed_apps_owner_read on public.zoz_pro_managed_apps for select to authenticated using ((select auth.uid())=owner_id);
drop policy if exists zoz_managed_caps_owner_read on public.zoz_pro_managed_app_capabilities;
create policy zoz_managed_caps_owner_read on public.zoz_pro_managed_app_capabilities for select to authenticated using ((select auth.uid())=owner_id);
drop policy if exists zoz_managed_commands_owner_read on public.zoz_pro_managed_app_commands;
create policy zoz_managed_commands_owner_read on public.zoz_pro_managed_app_commands for select to authenticated using ((select auth.uid())=owner_id);
drop policy if exists zoz_managed_audit_owner_read on public.zoz_pro_managed_app_audit;
create policy zoz_managed_audit_owner_read on public.zoz_pro_managed_app_audit for select to authenticated using ((select auth.uid())=owner_id);

revoke all on public.zoz_pro_managed_apps,public.zoz_pro_managed_app_capabilities,public.zoz_pro_managed_app_worker_tokens,public.zoz_pro_managed_app_commands,public.zoz_pro_managed_app_audit from anon,authenticated;
grant select on public.zoz_pro_managed_apps,public.zoz_pro_managed_app_capabilities,public.zoz_pro_managed_app_commands,public.zoz_pro_managed_app_audit to authenticated;
grant all on public.zoz_pro_managed_apps,public.zoz_pro_managed_app_capabilities,public.zoz_pro_managed_app_worker_tokens,public.zoz_pro_managed_app_commands,public.zoz_pro_managed_app_audit to service_role;
