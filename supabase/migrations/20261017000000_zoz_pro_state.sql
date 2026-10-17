begin;
create table if not exists public.zoz_pro_state (
  singleton boolean primary key default true check (singleton is true),
  version bigint not null check (version >= 1),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.zoz_pro_state enable row level security;
revoke all privileges on table public.zoz_pro_state from public, anon, authenticated, service_role;
grant select, insert, update on table public.zoz_pro_state to service_role;
comment on table public.zoz_pro_state is
  'ZOZ Pro durable serialized state. Singleton JSONB row with monotonic version CAS. Migration does not seed state.';
commit;
