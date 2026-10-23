-- Native YouTube monitoring owned by ZOZ Pro/Supabase.
-- Direct server-side API usage only; no vidIQ runtime dependency.
create table if not exists public.zoz_pro_youtube_competitors (
  channel_id text primary key check (channel_id ~ '^UC[A-Za-z0-9_-]{20,}$'),
  added_by uuid not null references auth.users(id) on delete cascade,
  display_name text not null default 'YouTube channel',
  handle text,
  channel_url text not null,
  active boolean not null default true,
  latest_stats jsonb not null default '{}'::jsonb,
  recent_videos jsonb not null default '[]'::jsonb,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists zoz_pro_youtube_competitors_active_idx
  on public.zoz_pro_youtube_competitors(active, display_name);
alter table public.zoz_pro_youtube_competitors enable row level security;

create table if not exists public.zoz_pro_youtube_snapshots (
  id uuid primary key default gen_random_uuid(),
  channel_id text not null,
  channel_type text not null check (channel_type in ('owned','competitor')),
  channel_name text not null,
  captured_at timestamptz not null default now(),
  window_start date,
  window_end date,
  stats jsonb not null default '{}'::jsonb,
  recent_videos jsonb not null default '[]'::jsonb,
  analytics jsonb not null default '{}'::jsonb,
  source text not null default 'youtube-data-api',
  created_at timestamptz not null default now()
);
create index if not exists zoz_pro_youtube_snapshots_channel_time_idx
  on public.zoz_pro_youtube_snapshots(channel_id, captured_at desc);
alter table public.zoz_pro_youtube_snapshots enable row level security;

comment on table public.zoz_pro_youtube_competitors is
  'ZOZ Pro native YouTube competitor monitoring; populated via direct Supabase-owned API calls.';
comment on table public.zoz_pro_youtube_snapshots is
  'Historical YouTube channel and recent-video analytics collected by ZOZ Pro directly.';
