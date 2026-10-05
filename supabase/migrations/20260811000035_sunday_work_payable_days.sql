-- A worked Sunday keeps its weekly-rest entitlement and adds one overtime day.
create or replace function public.get_monthly_payroll(p_year integer,p_month integer)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_start date;
  v_end date;
  v_effective_end date;
  v_today date := timezone('Europe/Istanbul',now())::date;
  v_now_time time := timezone('Europe/Istanbul',now())::time;
  v_result jsonb;
begin
  if p_year<2000 or p_year>2100 or p_month<1 or p_month>12 then raise exception 'Geçersiz ay veya yıl'; end if;
  v_start:=make_date(p_year,p_month,1);
  v_end:=(v_start+interval '1 month - 1 day')::date;
  v_effective_end:=least(v_end,case when v_now_time>=time '09:00' then v_today else v_today-1 end);
  select coalesce(jsonb_agg(jsonb_build_object(
    'personnel_id',p.id,'full_name',p.full_name,'monthly_salary',p.monthly_salary,
    'worked_days',coalesce(a.worked_days,0),'weekly_rest_days',coalesce(a.weekly_rest_days,0),
    'payable_days',coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)+coalesce(a.overtime_days,0),
    'absence_days',coalesce(a.absence_days,0),'report_days',coalesce(a.report_days,0),
    'overtime_days',coalesce(a.overtime_days,0),'advance_total',coalesce(v.advance_total,0),'absence_deduction',0,
    'overtime_payment',round((p.monthly_salary/30)*coalesce(a.overtime_days,0),2),
    'gross_accrued',round((p.monthly_salary/30)*(coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)),2),
    'net_receivable',greatest(0,round((p.monthly_salary/30)*(coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)+coalesce(a.overtime_days,0))-coalesce(v.advance_total,0),2))
  ) order by p.full_name),'[]'::jsonb) into v_result
  from public.personnel p
  left join lateral (
    select
      count(*) filter(where ar.status='worked' and extract(isodow from ar.attendance_date)<>7)::integer worked_days,
      count(*) filter(where extract(isodow from ar.attendance_date)=7 and ar.status in ('weekly_rest','worked'))::integer weekly_rest_days,
      count(*) filter(where ar.status::text in('absent','unexcused_absence'))::integer absence_days,
      count(*) filter(where ar.status='medical_report')::integer report_days,
      count(*) filter(where ar.status='worked' and extract(isodow from ar.attendance_date)=7)::integer overtime_days
    from public.attendance_records ar
    where ar.personnel_id=p.id and ar.attendance_date between v_start and v_effective_end
  ) a on true
  left join lateral (
    select coalesce(sum(pa.amount),0) advance_total from public.personnel_advances pa
    where pa.personnel_id=p.id and pa.advance_date between v_start and least(v_end,v_today)
  ) v on true;
  return v_result;
end;
$$;

revoke all on function public.get_monthly_payroll(integer,integer) from public,anon;
grant execute on function public.get_monthly_payroll(integer,integer) to authenticated;
