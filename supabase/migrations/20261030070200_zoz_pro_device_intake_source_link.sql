alter table public.zoz_pro_device_registry
  add column if not exists intake_source_id uuid
  references public.zoz_pro_video_intake_sources(id) on delete set null;

create index if not exists zoz_device_registry_intake_source_idx
  on public.zoz_pro_device_registry(intake_source_id)
  where intake_source_id is not null;
