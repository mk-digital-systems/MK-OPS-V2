-- Personnel salary, advances and monthly payroll calculation.
alter table public.personnel
  add column if not exists monthly_salary numeric(14, 2) not null default 0,
  add constraint personnel_monthly_salary_nonnegative check (monthly_salary >= 0);

alter table public.daily_work_plan_teams
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists work_location text,
  add column if not exists work_description text,
  add column if not exists notes text;

create index if not exists idx_dwp_teams_project_id on public.daily_work_plan_teams(project_id);
create index if not exists idx_dwp_teams_vehicle_id on public.daily_work_plan_teams(vehicle_id);

create table if not exists public.personnel_advances (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references public.personnel(id) on delete restrict,
  advance_date date not null default current_date,
  amount numeric(14, 2) not null check (amount > 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_personnel_advances_personnel_date on public.personnel_advances(personnel_id, advance_date desc);
alter table public.personnel_advances enable row level security;
grant select, insert, update, delete on public.personnel_advances to authenticated;
create policy "personnel_advances_select_role_based" on public.personnel_advances for select to authenticated using (public.can_view_personnel_attendance());
create policy "personnel_advances_insert_module_writer" on public.personnel_advances for insert to authenticated with check (public.has_module_write_permission('attendance'));
create policy "personnel_advances_update_module_writer" on public.personnel_advances for update to authenticated using (public.has_module_write_permission('attendance')) with check (public.has_module_write_permission('attendance'));
create policy "personnel_advances_delete_module_writer" on public.personnel_advances for delete to authenticated using (public.has_module_write_permission('attendance'));

create or replace function public.get_monthly_payroll(p_year integer, p_month integer)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_start date; v_end date; v_result jsonb;
begin
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then raise exception 'Geçersiz ay veya yıl'; end if;
  v_start := make_date(p_year, p_month, 1); v_end := (v_start + interval '1 month - 1 day')::date;
  select coalesce(jsonb_agg(jsonb_build_object(
    'personnel_id',p.id,'full_name',p.full_name,'monthly_salary',p.monthly_salary,
    'worked_days',coalesce(a.worked_days,0),'absence_days',coalesce(a.absence_days,0),
    'report_days',coalesce(a.report_days,0),'overtime_days',coalesce(a.overtime_days,0),
    'advance_total',coalesce(v.advance_total,0),
    'absence_deduction',round((p.monthly_salary/30)*(coalesce(a.absence_days,0)+coalesce(a.report_days,0)),2),
    'overtime_payment',round((p.monthly_salary/30)*coalesce(a.overtime_days,0),2),
    'net_receivable',round(p.monthly_salary-(p.monthly_salary/30)*(coalesce(a.absence_days,0)+coalesce(a.report_days,0))+(p.monthly_salary/30)*coalesce(a.overtime_days,0)-coalesce(v.advance_total,0),2)
  ) order by p.full_name),'[]'::jsonb) into v_result
  from public.personnel p
  left join lateral (select count(*) filter(where ar.status='worked')::integer worked_days,count(*) filter(where ar.status::text in('absent','unexcused_absence'))::integer absence_days,count(*) filter(where ar.status='medical_report')::integer report_days,count(*) filter(where ar.status='worked' and extract(isodow from ar.attendance_date)=7)::integer overtime_days from public.attendance_records ar where ar.personnel_id=p.id and ar.attendance_date between v_start and v_end) a on true
  left join lateral (select coalesce(sum(pa.amount),0) advance_total from public.personnel_advances pa where pa.personnel_id=p.id and pa.advance_date between v_start and v_end) v on true;
  return v_result;
end;$$;
revoke all on function public.get_monthly_payroll(integer,integer) from public,anon;
grant execute on function public.get_monthly_payroll(integer,integer) to authenticated;
