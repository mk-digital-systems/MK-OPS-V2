-- =============================================================================
-- 00012 — Proje durumunu aşamalardan otomatik hesapla
-- 00011'den sonra çalıştırılmalıdır.
-- =============================================================================

drop trigger if exists projects_archive_on_complete on public.projects;
drop trigger if exists projects_derive_automatic_status on public.projects;

create or replace function public.projects_derive_automatic_status()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_all_required_steps_done boolean;
  v_has_started_step boolean;
begin
  new.received_at := coalesce(new.received_at, current_date);

  v_all_required_steps_done :=
    new.joint_done is true
    and new.cable_pulled is true
    and (new.tracks_obk is false or new.obk_pulled is true)
    and (
      new.tracks_excavation is false
      or new.excavation_done is true
    );

  v_has_started_step :=
    new.obk_pulled is true
    or new.joint_done is true
    or new.cable_pulled is true;

  if v_all_required_steps_done then
    new.status := 'completed';
    new.completed_at := coalesce(new.completed_at, current_date);
    new.is_archived := true;
    new.archived_at := coalesce(new.archived_at, now());
  elsif new.received_at <= current_date - 30 then
    new.status := 'delayed';
    new.delayed_at := coalesce(new.delayed_at, current_date);
  elsif v_has_started_step then
    new.status := 'in_progress';
    new.in_progress_at := coalesce(new.in_progress_at, current_date);
  else
    new.status := 'waiting';
    new.waiting_at := coalesce(new.waiting_at, new.received_at, current_date);
  end if;

  if new.status <> 'completed' and new.is_archived = false then
    new.completed_at := null;
    new.archived_at := null;
  end if;

  return new;
end;
$$;

create trigger projects_derive_automatic_status
before insert or update of
  received_at,
  tracks_obk,
  obk_pulled,
  joint_done,
  cable_pulled,
  tracks_excavation,
  excavation_done
on public.projects
for each row execute function public.projects_derive_automatic_status();

-- Daha önce elle atanmış durumları mevcut aşama verilerinden yeniden hesapla.
update public.projects
set received_at = received_at
where is_archived = false;

create or replace function public.refresh_overdue_project_statuses()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_updated integer;
begin
  update public.projects
  set received_at = received_at
  where is_archived = false
    and status <> 'completed'
    and received_at <= current_date - 30
    and status <> 'delayed';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

grant execute on function public.refresh_overdue_project_statuses()
  to authenticated;

create or replace function public.bulk_update_project_tracking(p_updates jsonb)
returns setof public.projects
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;

  if jsonb_typeof(p_updates) <> 'array' then
    raise exception 'Güncellemeler JSON dizisi olmalıdır';
  end if;

  if jsonb_array_length(p_updates) > 250 then
    raise exception 'Tek işlemde en fazla 250 proje güncellenebilir';
  end if;

  return query
  update public.projects as p
  set
    tracks_obk = u.tracks_obk,
    obk_pulled = case when u.tracks_obk then u.obk_pulled else null end,
    tracks_joint = true,
    joint_done = u.joint_done,
    tracks_cable = true,
    cable_pulled = u.cable_pulled,
    tracks_excavation = u.tracks_excavation,
    excavation_done =
      case when u.tracks_excavation then u.excavation_done else null end,
    updated_by = auth.uid()
  from jsonb_to_recordset(p_updates) as u(
    id uuid,
    tracks_obk boolean,
    obk_pulled boolean,
    joint_done boolean,
    cable_pulled boolean,
    tracks_excavation boolean,
    excavation_done boolean
  )
  where p.id = u.id
  returning p.*;
end;
$$;

grant execute on function public.bulk_update_project_tracking(jsonb)
  to authenticated;

comment on function public.projects_derive_automatic_status() is
  'Durum sırası: tamamlandı, 30 gün gecikmiş, işlem başladı, başlamadı.';
comment on function public.refresh_overdue_project_statuses() is
  '30 günü geçen tamamlanmamış aktif projeleri gecikmiş olarak yeniler.';

create or replace function public.get_dashboard_overview()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_result jsonb;
begin
  perform public.refresh_overdue_project_statuses();

  with classified as (
    select
      p.*,
      case
        when p.status = 'completed' then 'completed'
        when p.status = 'delayed' then 'delayed'
        when p.tracks_excavation = true
          and p.excavation_done is distinct from true then 'excavation_waiting'
        when p.status = 'waiting' then 'not_started'
        when p.status = 'in_progress'
          and p.tracks_obk = true
          and p.obk_pulled is distinct from true then 'obk_waiting'
        when p.status = 'in_progress'
          and p.cable_pulled = false then 'cable_waiting'
        else 'in_progress'
      end as analysis_stage
    from public.projects p
  ),
  requested_categories(category_name, sort_order) as (
    values ('BF'::text, 1), ('GF'::text, 2), ('Kurumsal'::text, 3)
  ),
  category_analysis as (
    select
      rc.category_name as category,
      rc.sort_order,
      count(c.id)::int as total,
      count(c.id) filter (where c.analysis_stage = 'not_started')::int as not_started,
      count(c.id) filter (where c.analysis_stage = 'in_progress')::int as in_progress,
      count(c.id) filter (where c.analysis_stage = 'obk_waiting')::int as obk_waiting,
      count(c.id) filter (where c.analysis_stage = 'excavation_waiting')::int as excavation_waiting,
      count(c.id) filter (where c.analysis_stage = 'cable_waiting')::int as cable_waiting,
      count(c.id) filter (where c.analysis_stage = 'completed')::int as completed,
      count(c.id) filter (where c.analysis_stage = 'delayed')::int as delayed
    from requested_categories rc
    left join classified c on c.project_type = rc.category_name
    group by rc.category_name, rc.sort_order
  )
  select jsonb_build_object(
    'stats', jsonb_build_object(
      'total', (select count(*)::int from classified where is_archived = false),
      'waiting', (select count(*)::int from classified where is_archived = false and status = 'waiting'),
      'in_progress', (select count(*)::int from classified where is_archived = false and status = 'in_progress'),
      'excavation_permit_waiting', (select count(*)::int from classified where is_archived = false and analysis_stage = 'excavation_waiting'),
      'delayed', (select count(*)::int from classified where is_archived = false and status = 'delayed'),
      'completed', (select count(*)::int from classified where status = 'completed'),
      'archived', (select count(*)::int from classified where is_archived = true)
    ),
    'categories', (
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'category', category,
            'total', total,
            'not_started', not_started,
            'in_progress', in_progress,
            'obk_waiting', obk_waiting,
            'excavation_waiting', excavation_waiting,
            'cable_waiting', cable_waiting,
            'completed', completed,
            'delayed', delayed
          )
          order by sort_order
        ),
        '[]'::jsonb
      )
      from category_analysis
    ),
    'critical', jsonb_build_object(
      'delayed', (select count(*)::int from classified where is_archived = false and analysis_stage = 'delayed'),
      'excavation_waiting', (select count(*)::int from classified where is_archived = false and analysis_stage = 'excavation_waiting'),
      'obk_waiting', (select count(*)::int from classified where is_archived = false and analysis_stage = 'obk_waiting'),
      'cable_waiting', (select count(*)::int from classified where is_archived = false and analysis_stage = 'cable_waiting')
    ),
    'recently_updated', (
      select coalesce(jsonb_agg(to_jsonb(recent)), '[]'::jsonb)
      from (
        select * from public.projects
        where is_archived = false
        order by updated_at desc
        limit 8
      ) recent
    ),
    'recently_created', (
      select coalesce(jsonb_agg(to_jsonb(recent)), '[]'::jsonb)
      from (
        select * from public.projects
        where is_archived = false
        order by created_at desc
        limit 8
      ) recent
    )
  )
  into v_result;

  return v_result;
end;
$$;

grant execute on function public.get_dashboard_overview()
  to authenticated;
