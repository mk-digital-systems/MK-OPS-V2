-- BGFD ana kategori proje ID bazlıdır; dolap tipleri alt kategori olarak döner.
create or replace function public.get_dashboard_overview()
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v_result jsonb;
begin
  with hp_units as (
    select 'HP_ODAKLI'::text category,ps.id unit_id,
      case ps.manual_status when 'completed' then 'completed' when 'excavation_permit_waiting' then 'excavation_waiting'
        when 'in_progress' then 'in_progress' else 'not_started' end stage
    from public.project_sheets ps join public.projects p on p.id=ps.project_id where p.project_type='HP_ODAKLI'
  ), corporate_units as (
    select 'KURUMSAL_TTVPN'::text category,p.id unit_id,
      case p.status when 'completed' then 'completed' when 'excavation_permit_waiting' then 'excavation_waiting'
        when 'waiting' then 'not_started' else 'in_progress' end stage
    from public.projects p where p.project_type='KURUMSAL_TTVPN'
  ), bgfd_units as (
    select 'BGFD'::text category,p.id unit_id,
      case p.status when 'completed' then 'completed' when 'excavation_permit_waiting' then 'excavation_waiting'
        when 'waiting' then 'not_started' else 'in_progress' end stage
    from public.projects p where p.project_type='BGFD'
  ), units as (
    select * from hp_units union all select * from corporate_units union all select * from bgfd_units
  ), requested(category,label,unit_label,sort_order) as (
    values ('HP_ODAKLI'::text,'HP Odaklı'::text,'Pafta'::text,1),
      ('KURUMSAL_TTVPN','Kurumsal TTVPN','Proje',2),('BGFD','BGFD','Proje',3)
  ), category_analysis as (
    select r.category,r.label,r.unit_label,r.sort_order,count(u.unit_id)::int total,
      count(u.unit_id) filter(where u.stage='not_started')::int not_started,
      count(u.unit_id) filter(where u.stage='in_progress')::int in_progress,
      count(u.unit_id) filter(where u.stage='excavation_waiting')::int excavation_waiting,
      count(u.unit_id) filter(where u.stage='completed')::int completed
    from requested r left join units u on u.category=r.category group by r.category,r.label,r.unit_label,r.sort_order
  ), bgfd_subcategories as (
    select cabinet_type::text label,count(*)::int count from public.project_cabinets c
    join public.projects p on p.id=c.project_id where p.project_type='BGFD' group by cabinet_type
  )
  select jsonb_build_object(
    'stats',jsonb_build_object(
      'total',(select count(*)::int from public.projects where not is_archived),
      'waiting',(select count(*)::int from public.projects where not is_archived and status='waiting'),
      'in_progress',(select count(*)::int from public.projects where not is_archived and status='in_progress'),
      'excavation_permit_waiting',(select count(*)::int from public.projects where not is_archived and status='excavation_permit_waiting'),
      'delayed',(select count(*)::int from public.projects where not is_archived and status='delayed'),
      'completed',(select count(*)::int from public.projects where status='completed'),
      'archived',(select count(*)::int from public.projects where is_archived)),
    'categories',(select coalesce(jsonb_agg(jsonb_build_object(
      'category',category,'label',label,'unit_label',unit_label,'total',total,
      'not_started',not_started,'in_progress',in_progress,'excavation_waiting',excavation_waiting,
      'completed',completed,'obk_waiting',0,'cable_waiting',0,'delayed',0,
      'subcategories',case when category='BGFD' then (select coalesce(jsonb_agg(jsonb_build_object('label',b.label,'count',b.count)
        order by case b.label when 'T7' then 1 when 'T9' then 2 when 'T11' then 3 when 'T21' then 4 when 'T23' then 5 else 99 end),'[]'::jsonb) from bgfd_subcategories b) else '[]'::jsonb end
    ) order by sort_order),'[]'::jsonb) from category_analysis),
    'critical',jsonb_build_object(
      'delayed',(select count(*)::int from public.projects where not is_archived and status='delayed'),
      'excavation_waiting',(select count(*)::int from public.projects where not is_archived and status='excavation_permit_waiting'),
      'obk_waiting',0,'cable_waiting',0),
    'recently_updated',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from public.projects where not is_archived order by updated_at desc limit 8)x),
    'recently_created',(select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (select * from public.projects where not is_archived order by created_at desc limit 8)x)
  ) into v_result;
  return v_result;
end; $$;
grant execute on function public.get_dashboard_overview() to authenticated;
