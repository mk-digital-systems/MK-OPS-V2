-- =============================================================================
-- 00008 — Dashboard kategori analizi (tek aggregate sorgusu)
-- 00007'den sonra çalıştırılmalıdır.
-- =============================================================================

create or replace function public.get_dashboard_overview()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with classified as (
    select
      p.*,
      case
        when p.status = 'completed' then 'completed'
        when p.status = 'delayed' then 'delayed'
        when p.status = 'excavation_permit_waiting' then 'excavation_waiting'
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
      'in_progress', (select count(*)::int from classified where is_archived = false and status in ('in_progress', 'excavation_permit_waiting', 'delayed')),
      'excavation_permit_waiting', (select count(*)::int from classified where is_archived = false and status = 'excavation_permit_waiting'),
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
        select *
        from public.projects
        where is_archived = false
        order by updated_at desc
        limit 8
      ) recent
    ),
    'recently_created', (
      select coalesce(jsonb_agg(to_jsonb(recent)), '[]'::jsonb)
      from (
        select *
        from public.projects
        where is_archived = false
        order by created_at desc
        limit 8
      ) recent
    )
  );
$$;

grant execute on function public.get_dashboard_overview() to authenticated;

comment on function public.get_dashboard_overview() is
  'Dashboard kartları, kategori grafikleri, kritik durumlar ve son projeler için tek sorguluk özet.';
