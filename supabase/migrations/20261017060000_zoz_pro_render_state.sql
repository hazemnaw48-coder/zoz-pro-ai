begin;
create table if not exists public.zoz_pro_render_state (
  singleton boolean primary key default true check (singleton is true),
  version bigint not null check (version >= 1),
  state jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.zoz_pro_render_state enable row level security;
revoke all privileges on table public.zoz_pro_render_state from public, anon, authenticated, service_role;
grant select, insert, update on table public.zoz_pro_render_state to service_role;
comment on table public.zoz_pro_render_state is
  'ZOZ Pro isolated Render staging state. Separate singleton JSONB row; no production or shared-preview state copied.';
commit;
