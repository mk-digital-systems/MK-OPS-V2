-- Enforce attendance timing/Sunday rules and calculate salary from accrued payable days.

create or replace function public.validate_attendance_date_and_weekly_rest()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_now timestamp := timezone('Europe/Istanbul', now());
begin
  if new.attendance_date > v_now::date
    or (new.attendance_date = v_now::date and v_now::time < time '09:00') then
    raise exception 'Puantaj yalnızca ilgili gün saat 09:00 sonrası veya geçmiş tarihler için girilebilir';
  end if;
  if new.status = 'weekly_rest' and extract(isodow from new.attendance_date) <> 7 then
    raise exception 'Hafta tatili yalnızca pazar günü olabilir';
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_records_validate_date_and_weekly_rest on public.attendance_records;
create trigger attendance_records_validate_date_and_weekly_rest
before insert or update on public.attendance_records
for each row execute function public.validate_attendance_date_and_weekly_rest();

create or replace function public.ensure_sunday_attendance_for_month(p_year integer,p_month integer)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_month_start date;
  v_month_end date;
  v_today date := timezone('Europe/Istanbul', now())::date;
  v_now_time time := timezone('Europe/Istanbul', now())::time;
  v_last_date date;
  v_inserted integer;
begin
  if auth.uid() is not null and not public.has_module_write_permission('attendance') then return 0; end if;
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then raise exception 'Geçersiz ay veya yıl'; end if;
  v_month_start := make_date(p_year,p_month,1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;
  v_last_date := least(v_month_end,case when v_now_time >= time '09:00' then v_today else v_today-1 end);
  if v_last_date < v_month_start then return 0; end if;
  insert into public.attendance_records(personnel_id,attendance_date,status,is_auto_generated)
  select p.id,d.attendance_date,'weekly_rest'::public.attendance_status,true
  from public.personnel p
  cross join lateral (
    select generated_date::date attendance_date
    from generate_series(v_month_start::timestamp,v_last_date::timestamp,interval '1 day') generated_date
    where extract(isodow from generated_date)=7
  ) d
  where coalesce(p.employment_start_date,(p.created_at at time zone 'Europe/Istanbul')::date)<=d.attendance_date
    and (p.employment_end_date is null or p.employment_end_date>=d.attendance_date)
  on conflict(personnel_id,attendance_date) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$$;

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
    'payable_days',coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0),
    'absence_days',coalesce(a.absence_days,0),'report_days',coalesce(a.report_days,0),
    'overtime_days',coalesce(a.overtime_days,0),'advance_total',coalesce(v.advance_total,0),
    'absence_deduction',0,
    'overtime_payment',round((p.monthly_salary/30)*coalesce(a.overtime_days,0),2),
    'gross_accrued',round((p.monthly_salary/30)*(coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)),2),
    'net_receivable',greatest(0,round((p.monthly_salary/30)*(coalesce(a.worked_days,0)+coalesce(a.weekly_rest_days,0)+coalesce(a.overtime_days,0))-coalesce(v.advance_total,0),2))
  ) order by p.full_name),'[]'::jsonb) into v_result
  from public.personnel p
  left join lateral (
    select count(*) filter(where ar.status='worked')::integer worked_days,
      count(*) filter(where ar.status='weekly_rest')::integer weekly_rest_days,
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

