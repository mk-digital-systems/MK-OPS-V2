-- =============================================================================
-- 00014 — Personel sayfası aylık puantaj özeti
-- 00013'ten sonra çalıştırılmalıdır.
-- =============================================================================

create or replace function public.get_personnel_attendance_summary(
  p_personnel_id uuid,
  p_year integer,
  p_month integer
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with month_range as (
    select
      make_date(p_year, p_month, 1) as month_start,
      (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date
        as month_end
  )
  select jsonb_build_object(
    'personnel_id', p.id,
    'full_name', p.full_name,
    'year', p_year,
    'month', p_month,
    'worked', count(a.id) filter (where a.status = 'worked')::integer,
    'absent', count(a.id) filter (where a.status = 'absent')::integer,
    'leave', count(a.id) filter (where a.status = 'leave')::integer,
    'medical_report',
      count(a.id) filter (where a.status = 'medical_report')::integer,
    'weekly_rest',
      count(a.id) filter (where a.status = 'weekly_rest')::integer
  )
  from public.personnel p
  cross join month_range mr
  left join public.attendance_records a
    on a.personnel_id = p.id
    and a.attendance_date between mr.month_start and mr.month_end
  where p.id = p_personnel_id
  group by p.id, p.full_name;
$$;

revoke execute on function public.get_personnel_attendance_summary(uuid, integer, integer)
  from public, anon;
grant execute on function public.get_personnel_attendance_summary(uuid, integer, integer)
  to authenticated;
