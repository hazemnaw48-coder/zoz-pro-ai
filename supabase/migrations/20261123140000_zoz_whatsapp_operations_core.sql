-- ZOZ WhatsApp Operations core schema (Preview-first).
-- No browser-role access. All data access is server-side through the owner-verified Edge Function.
create extension if not exists pgcrypto;

create table if not exists public.zoz_whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null unique default 'zoz_business',
  display_name text not null default 'ZOZ Business',
  business_number_e164 text not null default '+201222748475',
  phone_number_id text unique,
  waba_id text,
  provider text not null default 'meta_cloud_api' check (provider in ('meta_cloud_api')),
  connection_mode text not null default 'coexistence_pending'
    check (connection_mode in ('coexistence_pending','coexistence','cloud_api')),
  connection_status text not null default 'awaiting_meta_setup'
    check (connection_status in ('awaiting_meta_setup','identifiers_saved','connected','paused','error')),
  is_enabled boolean not null default false,
  auto_reply_mode text not null default 'draft_only'
    check (auto_reply_mode in ('off','draft_only','safe_auto')),
  emergency_stop boolean not null default true,
  free_service_monthly_cap integer not null default 900
    check (free_service_monthly_cap between 0 and 900),
  owner_approval_for_sensitive boolean not null default true,
  last_webhook_at timestamptz,
  last_template_sync_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.zoz_whatsapp_channels (workspace_key, display_name, business_number_e164)
values ('zoz_business', 'ZOZ Business', '+201222748475')
on conflict (workspace_key) do nothing;

create table if not exists public.zoz_whatsapp_contacts (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.zoz_whatsapp_channels(id) on delete cascade,
  wa_id text not null,
  phone_e164 text,
  display_name text,
  is_excluded boolean not null default false,
  opted_out boolean not null default false,
  automated_reply_allowed boolean not null default true,
  marketing_opt_in boolean not null default false,
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, wa_id)
);

create table if not exists public.zoz_whatsapp_conversations (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.zoz_whatsapp_channels(id) on delete cascade,
  contact_id uuid not null references public.zoz_whatsapp_contacts(id) on delete cascade,
  status text not null default 'open' check (status in ('open','pending','closed')),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  service_window_ends_at timestamptz,
  last_message_at timestamptz,
  last_message_preview text,
  escalated boolean not null default false,
  escalation_reason text,
  assigned_agent_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel_id, contact_id)
);

create table if not exists public.zoz_whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.zoz_whatsapp_channels(id) on delete cascade,
  conversation_id uuid references public.zoz_whatsapp_conversations(id) on delete set null,
  contact_id uuid not null references public.zoz_whatsapp_contacts(id) on delete cascade,
  provider_message_id text unique,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text',
  body text,
  media_id text,
  delivery_status text not null default 'received',
  provider_timestamp timestamptz,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.zoz_whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.zoz_whatsapp_channels(id) on delete cascade,
  provider_template_id text not null,
  template_name text not null,
  language text not null,
  category text not null,
  approval_status text not null,
  components jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  unique (channel_id, provider_template_id)
);

create table if not exists public.zoz_whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.zoz_whatsapp_channels(id) on delete set null,
  provider_event_key text not null unique,
  event_type text not null,
  phone_number_id text,
  payload_hash text not null,
  processing_status text not null default 'received'
    check (processing_status in ('received','processed','ignored','failed')),
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.zoz_whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.zoz_whatsapp_channels(id) on delete cascade,
  conversation_id uuid not null references public.zoz_whatsapp_conversations(id) on delete cascade,
  contact_id uuid not null references public.zoz_whatsapp_contacts(id) on delete cascade,
  source_message_id uuid references public.zoz_whatsapp_messages(id) on delete set null,
  message_kind text not null default 'service_text'
    check (message_kind in ('service_text','approved_template')),
  body text not null,
  status text not null default 'draft'
    check (status in ('draft','queued','approved','sending','sent','failed','blocked','cancelled')),
  created_by text not null default 'agent'
    check (created_by in ('agent','owner','system')),
  decision_label text not null default 'needs_review',
  decision_reason text,
  requires_owner_approval boolean not null default true,
  is_free_window_message boolean not null default false,
  idempotency_key text not null unique,
  provider_message_id text,
  attempts integer not null default 0,
  last_error_code text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.zoz_whatsapp_monthly_usage (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.zoz_whatsapp_channels(id) on delete cascade,
  month_start date not null,
  free_service_messages integer not null default 0 check (free_service_messages >= 0),
  updated_at timestamptz not null default now(),
  unique (channel_id, month_start)
);

create table if not exists public.zoz_whatsapp_knowledge (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'zoz_business',
  knowledge_key text not null,
  title text not null,
  content text not null,
  is_approved boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (workspace_key, knowledge_key)
);

create table if not exists public.zoz_whatsapp_audit (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.zoz_whatsapp_channels(id) on delete set null,
  actor_type text not null check (actor_type in ('owner','agent','system','provider')),
  actor_ref text,
  action text not null,
  status text not null default 'recorded',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

insert into public.zoz_whatsapp_knowledge (workspace_key,knowledge_key,title,content,is_approved)
values
  ('zoz_business','company_intro','نبذة الشركة','ZOZ شركة تعمل على بناء أنظمة وحلول رقمية وتشغيلية للشركات. اسأل العميل عن طبيعة نشاطه والمشكلة التي يريد حلها قبل اقتراح منتج محدد.',true),
  ('zoz_business','aftersales_status','حالة ZOZ AfterSales','ZOZ AfterSales منتج قيد التطوير والتحقق مع شركات صيانة وتكييف. لا تعد العميل بأن المنتج متاح تجاريًا أو منشور بالكامل، ولا تذكر سعرًا أو موعد إطلاق دون موافقة المالك.',true)
on conflict (workspace_key,knowledge_key) do nothing;

create index if not exists zoz_whatsapp_conversations_updated_idx
  on public.zoz_whatsapp_conversations (updated_at desc);
create index if not exists zoz_whatsapp_messages_conversation_idx
  on public.zoz_whatsapp_messages (conversation_id, created_at desc);
create index if not exists zoz_whatsapp_outbox_status_idx
  on public.zoz_whatsapp_outbox (status, created_at);
create index if not exists zoz_whatsapp_contacts_phone_idx
  on public.zoz_whatsapp_contacts (phone_e164);

alter table public.zoz_whatsapp_channels enable row level security;
alter table public.zoz_whatsapp_contacts enable row level security;
alter table public.zoz_whatsapp_conversations enable row level security;
alter table public.zoz_whatsapp_messages enable row level security;
alter table public.zoz_whatsapp_templates enable row level security;
alter table public.zoz_whatsapp_webhook_events enable row level security;
alter table public.zoz_whatsapp_outbox enable row level security;
alter table public.zoz_whatsapp_monthly_usage enable row level security;
alter table public.zoz_whatsapp_knowledge enable row level security;
alter table public.zoz_whatsapp_audit enable row level security;

revoke all on public.zoz_whatsapp_channels from anon, authenticated;
revoke all on public.zoz_whatsapp_contacts from anon, authenticated;
revoke all on public.zoz_whatsapp_conversations from anon, authenticated;
revoke all on public.zoz_whatsapp_messages from anon, authenticated;
revoke all on public.zoz_whatsapp_templates from anon, authenticated;
revoke all on public.zoz_whatsapp_webhook_events from anon, authenticated;
revoke all on public.zoz_whatsapp_outbox from anon, authenticated;
revoke all on public.zoz_whatsapp_monthly_usage from anon, authenticated;
revoke all on public.zoz_whatsapp_knowledge from anon, authenticated;
revoke all on public.zoz_whatsapp_audit from anon, authenticated;

grant select, insert, update, delete on public.zoz_whatsapp_channels to service_role;
grant select, insert, update, delete on public.zoz_whatsapp_contacts to service_role;
grant select, insert, update, delete on public.zoz_whatsapp_conversations to service_role;
grant select, insert, update, delete on public.zoz_whatsapp_messages to service_role;
grant select, insert, update, delete on public.zoz_whatsapp_templates to service_role;
grant select, insert, update, delete on public.zoz_whatsapp_webhook_events to service_role;
grant select, insert, update, delete on public.zoz_whatsapp_outbox to service_role;
grant select, insert, update, delete on public.zoz_whatsapp_monthly_usage to service_role;
grant select, insert, update, delete on public.zoz_whatsapp_knowledge to service_role;
grant select, insert, update, delete on public.zoz_whatsapp_audit to service_role;

create or replace function public.zoz_whatsapp_reserve_free_quota(p_channel_id uuid, p_limit integer)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  reserved boolean := false;
  month_key date := date_trunc('month', now())::date;
begin
  with reservation as (
    insert into public.zoz_whatsapp_monthly_usage (channel_id, month_start, free_service_messages)
    values (p_channel_id, month_key, 1)
    on conflict (channel_id, month_start) do update
      set free_service_messages = public.zoz_whatsapp_monthly_usage.free_service_messages + 1,
          updated_at = now()
      where public.zoz_whatsapp_monthly_usage.free_service_messages < greatest(0, least(p_limit, 900))
    returning id
  )
  select exists(select 1 from reservation) into reserved;
  return reserved;
end;
$$;

create or replace function public.zoz_whatsapp_release_free_quota(p_channel_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  released boolean := false;
  month_key date := date_trunc('month', now())::date;
begin
  update public.zoz_whatsapp_monthly_usage
     set free_service_messages = greatest(0, free_service_messages - 1),
         updated_at = now()
   where channel_id = p_channel_id and month_start = month_key
  returning true into released;
  return coalesce(released, false);
end;
$$;

revoke all on function public.zoz_whatsapp_reserve_free_quota(uuid, integer) from public, anon, authenticated;
revoke all on function public.zoz_whatsapp_release_free_quota(uuid) from public, anon, authenticated;
grant execute on function public.zoz_whatsapp_reserve_free_quota(uuid, integer) to service_role;
grant execute on function public.zoz_whatsapp_release_free_quota(uuid) to service_role;
