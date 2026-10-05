-- =============================================================================
-- 00007 — BF / GF projeleri için OBK çekim takibi
-- =============================================================================

alter table public.projects
  add column if not exists tracks_obk boolean not null default false,
  add column if not exists obk_pulled boolean;

comment on column public.projects.tracks_obk is
  'Proje için OBK takibi yapılıp yapılmayacağını belirler';
comment on column public.projects.obk_pulled is
  'Yalnız BF/GF projeleri: true=OBK çekildi, false=OBK çekilmedi, null=belirtilmedi';

create index if not exists idx_projects_bf_gf_tracking
  on public.projects (project_type, tracks_obk, obk_pulled, joint_done)
  where project_type in ('BF', 'GF');

create or replace function public.get_dashboard_stats()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'total',
      (select count(*)::int from public.projects where is_archived = false),
    'waiting',
      (select count(*)::int from public.projects where is_archived = false and status = 'waiting'),
    'in_progress',
      (select count(*)::int from public.projects
       where is_archived = false
       and status in ('in_progress', 'excavation_permit_waiting', 'delayed')),
    'excavation_permit_waiting',
      (select count(*)::int from public.projects where is_archived = false and status = 'excavation_permit_waiting'),
    'delayed',
      (select count(*)::int from public.projects where is_archived = false and status = 'delayed'),
    'completed',
      (select count(*)::int from public.projects where status = 'completed'),
    'archived',
      (select count(*)::int from public.projects where is_archived = true)
  );
$$;

grant execute on function public.get_dashboard_stats() to authenticated;
