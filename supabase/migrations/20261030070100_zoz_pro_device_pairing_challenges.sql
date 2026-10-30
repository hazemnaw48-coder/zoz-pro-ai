create table if not exists public.zoz_pro_device_pairing_challenges (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists zoz_device_pairing_owner_idx
  on public.zoz_pro_device_pairing_challenges(owner_id, created_at desc);
alter table public.zoz_pro_device_pairing_challenges enable row level security;
revoke all on public.zoz_pro_device_pairing_challenges from anon, authenticated;
grant all on public.zoz_pro_device_pairing_challenges to service_role;
