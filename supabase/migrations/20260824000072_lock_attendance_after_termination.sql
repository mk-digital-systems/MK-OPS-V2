-- Prevent attendance changes outside a personnel employment period.

create or replace function public.guard_attendance_employment_period()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_personnel_id uuid := case when tg_op = 'DELETE' then old.personnel_id else new.personnel_id end;
  v_attendance_date date := case when tg_op = 'DELETE' then old.attendance_date else new.attendance_date end;
begin
  if not exists (
    select 1
    from public.personnel p
    where p.id = v_personnel_id
      and (
        (
          v_attendance_date >= coalesce(p.employment_start_date, v_attendance_date)
          and (p.employment_end_date is null or v_attendance_date <= p.employment_end_date)
        )
        or exists (
          select 1
          from public.personnel_employment_periods period
          where period.personnel_id = p.id
            and v_attendance_date >= coalesce(period.employment_start_date, v_attendance_date)
            and v_attendance_date <= period.employment_end_date
        )
      )
  ) then
    raise exception 'Çalışma dönemi dışındaki günler için puantaj düzenlenemez';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists attendance_records_guard_employment_period
  on public.attendance_records;
create trigger attendance_records_guard_employment_period
before insert or update or delete on public.attendance_records
for each row execute function public.guard_attendance_employment_period();
