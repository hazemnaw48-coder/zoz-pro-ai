-- Proposed ZOZ Pro-only YouTube analytics OAuth storage.
-- Apply only after reviewing the migration and configuring Supabase Edge Function secrets.
create table if not exists public.zoz_pro_youtube_oauth_states (
  state_hash text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.zoz_pro_youtube_analytics_tokens (
  channel_id text primary key check (channel_id = 'UCIael48cvwPG3gKj--c7HKw'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text,
  token_expires_at timestamptz not null,
  scopes text[] not null default '{}',
  status text not null default 'active' check (status in ('active','revoked','error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.zoz_pro_youtube_oauth_states enable row level security;
alter table public.zoz_pro_youtube_analytics_tokens enable row level security;
revoke all on public.zoz_pro_youtube_oauth_states from anon, authenticated;
revoke all on public.zoz_pro_youtube_analytics_tokens from anon, authenticated;
