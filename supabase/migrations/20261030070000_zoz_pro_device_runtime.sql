create table if not exists public.zoz_pro_device_registry (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null check (char_length(device_name) between 1 and 100),
  platform text not null default 'android' check (platform = 'android'),
  app_package text not null default 'com.zozpro.flowbridge',
  app_version text not null default '0.1.0',
  device_status text not null default 'active' check (device_status in ('active','paused','revoked')),
  capabilities jsonb not null default '[]'::jsonb,
  last_seen_at timestamptz,
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.zoz_pro_device_credentials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.zoz_pro_device_registry(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create table if not exists public.zoz_pro_device_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.zoz_pro_device_registry(id) on delete cascade,
  capability_id text not null check (capability_id in (
    'device.health_check',
    'flow.open',
    'flow.copy_prompt',
    'media.inspect_selected',
    'media.assemble',
    'media.upload_intake'
  )),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('awaiting_owner_approval','queued','running','succeeded','failed','cancelled')),
  approval_required boolean not null default false,
  approval_status text not null default 'not_required' check (approval_status in ('not_required','pending','approved','denied')),
  approval_record jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  priority smallint not null default 3 check (priority between 1 and 5),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  scheduled_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  result jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  unique(owner_id, idempotency_key),
  check (
    (approval_required = false and approval_status = 'not_required' and status <> 'awaiting_owner_approval')
    or
    (approval_required = true and approval_status in ('pending','approved','denied'))
  )
);

create table if not exists public.zoz_pro_device_job_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.zoz_pro_device_registry(id) on delete set null,
  job_id uuid references public.zoz_pro_device_jobs(id) on delete set null,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.zoz_pro_android_app_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_key text not null,
  display_name text not null,
  package_name text,
  purpose text not null default '',
  repository text,
  branch text,
  lifecycle_status text not null default 'planned' check (lifecycle_status in ('planned','specified','in_progress','building','testing','needs_owner_approval','released','paused','archived')),
  current_version text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, project_key)
);

create table if not exists public.zoz_pro_android_app_builds (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.zoz_pro_android_app_projects(id) on delete cascade,
  version_name text,
  version_code integer,
  branch text not null,
  commit_sha text not null,
  workflow_run_id text,
  workflow_run_url text,
  build_status text not null default 'queued' check (build_status in ('queued','running','succeeded','failed','expired')),
  artifact_name text,
  artifact_id text,
  artifact_url text,
  artifact_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists zoz_device_registry_owner_status_idx
  on public.zoz_pro_device_registry(owner_id, device_status, created_at desc);
create index if not exists zoz_device_credentials_device_idx
  on public.zoz_pro_device_credentials(device_id) where revoked_at is null;
create index if not exists zoz_device_jobs_device_status_idx
  on public.zoz_pro_device_jobs(device_id, status, priority, scheduled_at, created_at);
create index if not exists zoz_device_jobs_owner_status_idx
  on public.zoz_pro_device_jobs(owner_id, status, updated_at desc);
create index if not exists zoz_device_job_events_owner_created_idx
  on public.zoz_pro_device_job_events(owner_id, created_at desc);
create index if not exists zoz_android_app_projects_owner_idx
  on public.zoz_pro_android_app_projects(owner_id, updated_at desc);
create index if not exists zoz_android_app_builds_project_idx
  on public.zoz_pro_android_app_builds(project_id, created_at desc);

alter table public.zoz_pro_device_registry enable row level security;
alter table public.zoz_pro_device_credentials enable row level security;
alter table public.zoz_pro_device_jobs enable row level security;
alter table public.zoz_pro_device_job_events enable row level security;
alter table public.zoz_pro_android_app_projects enable row level security;
alter table public.zoz_pro_android_app_builds enable row level security;

drop policy if exists zoz_device_registry_owner_read on public.zoz_pro_device_registry;
create policy zoz_device_registry_owner_read on public.zoz_pro_device_registry
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists zoz_device_jobs_owner_read on public.zoz_pro_device_jobs;
create policy zoz_device_jobs_owner_read on public.zoz_pro_device_jobs
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists zoz_device_job_events_owner_read on public.zoz_pro_device_job_events;
create policy zoz_device_job_events_owner_read on public.zoz_pro_device_job_events
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists zoz_android_projects_owner_read on public.zoz_pro_android_app_projects;
create policy zoz_android_projects_owner_read on public.zoz_pro_android_app_projects
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists zoz_android_builds_owner_read on public.zoz_pro_android_app_builds;
create policy zoz_android_builds_owner_read on public.zoz_pro_android_app_builds
  for select to authenticated using ((select auth.uid()) = owner_id);

revoke all on public.zoz_pro_device_credentials from anon, authenticated;
grant select on public.zoz_pro_device_registry, public.zoz_pro_device_jobs,
  public.zoz_pro_device_job_events, public.zoz_pro_android_app_projects,
  public.zoz_pro_android_app_builds to authenticated;
grant all on public.zoz_pro_device_registry, public.zoz_pro_device_credentials,
  public.zoz_pro_device_jobs, public.zoz_pro_device_job_events,
  public.zoz_pro_android_app_projects, public.zoz_pro_android_app_builds to service_role;
