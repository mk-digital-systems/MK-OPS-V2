-- Record personnel termination details and retain earned attendance visibility.

alter table public.personnel
  add column if not exists termination_reason text null;

alter table public.personnel
  drop constraint if exists personnel_termination_reason_length;
alter table public.personnel
  add constraint personnel_termination_reason_length
  check (termination_reason is null or char_length(trim(termination_reason)) between 1 and 1000);

comment on column public.personnel.termination_reason is
  'Personelin işten çıkış sebebi';

create table if not exists public.personnel_employment_periods (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null references public.personnel(id) on delete cascade,
  employment_start_date date null,
  employment_end_date date not null,
  termination_reason text not null,
  created_at timestamptz not null default now(),
  constraint personnel_employment_period_dates check (
    employment_start_date is null or employment_end_date >= employment_start_date
  ),
  constraint personnel_employment_period_reason check (
    char_length(trim(termination_reason)) between 1 and 1000
  )
);

create index if not exists idx_personnel_employment_periods_personnel_end
  on public.personnel_employment_periods(personnel_id, employment_end_date desc);

alter table public.personnel_employment_periods enable row level security;
grant select, insert on public.personnel_employment_periods to authenticated;

drop policy if exists "personnel_employment_periods_select" on public.personnel_employment_periods;
create policy "personnel_employment_periods_select"
  on public.personnel_employment_periods for select to authenticated
  using (public.can_view_personnel_attendance());

drop policy if exists "personnel_employment_periods_insert" on public.personnel_employment_periods;
create policy "personnel_employment_periods_insert"
  on public.personnel_employment_periods for insert to authenticated
  with check (public.has_module_write_permission('personnel'));

create or replace function public.validate_personnel_termination()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.is_active = true and new.is_active = false then
    if new.employment_end_date is null then
      raise exception 'İşten çıkış tarihi zorunludur';
    end if;
    if nullif(trim(new.termination_reason), '') is null then
      raise exception 'İşten çıkış sebebi zorunludur';
    end if;

    insert into public.personnel_employment_periods (
      personnel_id,
      employment_start_date,
      employment_end_date,
      termination_reason
    ) values (
      old.id,
      old.employment_start_date,
      new.employment_end_date,
      trim(new.termination_reason)
    );
  end if;

  if old.is_active = false and new.is_active = true then
    if new.employment_start_date is null then
      raise exception 'Yeni işe giriş tarihi zorunludur';
    end if;
    if old.employment_end_date is not null
      and new.employment_start_date <= old.employment_end_date then
      raise exception 'Yeni işe giriş tarihi son çıkış tarihinden sonra olmalıdır';
    end if;
    new.employment_end_date := null;
    new.termination_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists personnel_validate_termination on public.personnel;
create trigger personnel_validate_termination
before update on public.personnel
for each row execute function public.validate_personnel_termination();

create or replace function public.get_monthly_attendance(
  p_year integer,
  p_month integer,
  p_active_filter text default 'active',
  p_search text default '',
  p_status_filter text default 'all'
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_month_start date;
  v_month_end date;
  v_result jsonb;
begin
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then
    raise exception 'Geçersiz ay veya yıl';
  end if;
  if p_active_filter not in ('active', 'passive', 'all') then
    raise exception 'Geçersiz personel filtresi';
  end if;
  if p_status_filter not in (
    'all', 'worked', 'absent', 'unexcused_absence', 'leave',
    'medical_report', 'weekly_rest'
  ) then
    raise exception 'Geçersiz puantaj durum filtresi';
  end if;

  perform public.ensure_sunday_attendance_for_month(p_year, p_month);
  v_month_start := make_date(p_year, p_month, 1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;

  with monthly_records as (
    select a.*
    from public.attendance_records a
    where a.attendance_date between v_month_start and v_month_end
      and a.attendance_date <= (now() at time zone 'Europe/Istanbul')::date
  ),
  filtered_personnel as (
    select p.*
    from public.personnel p
    where (
      p_active_filter = 'all'
      or (
        p_active_filter = 'active'
        and (
          p.is_active = true
          or exists (
            select 1
            from monthly_records earned_record
            where earned_record.personnel_id = p.id
              and earned_record.status::text in ('worked', 'weekly_rest')
          )
        )
      )
      or (p_active_filter = 'passive' and p.is_active = false)
    )
    and (
      trim(p_search) = ''
      or p.full_name ilike '%' || trim(p_search) || '%'
      or coalesce(p.phone, '') ilike '%' || trim(p_search) || '%'
    )
    and (
      p_status_filter = 'all'
      or exists (
        select 1 from monthly_records filtered_record
        where filtered_record.personnel_id = p.id
          and filtered_record.status::text = p_status_filter
      )
    )
  ),
  personnel_month as (
    select
      p.id, p.full_name, p.phone, p.tc_identity_number, p.is_active,
      p.employment_start_date, p.employment_end_date,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', to_char(a.attendance_date, 'YYYY-MM-DD'),
            'status', a.status,
            'is_auto_generated', a.is_auto_generated,
            'leave_type', a.leave_type
          ) order by a.attendance_date
        ) filter (where a.id is not null),
        '[]'::jsonb
      ) as records,
      count(a.id) filter (where a.status::text = 'worked')::integer as worked,
      count(a.id) filter (where a.status::text = 'absent')::integer as absent,
      count(a.id) filter (where a.status::text = 'unexcused_absence')::integer as unexcused_absence,
      count(a.id) filter (where a.status::text = 'leave')::integer as leave,
      count(a.id) filter (where a.status::text = 'medical_report')::integer as medical_report,
      count(a.id) filter (where a.status::text = 'weekly_rest')::integer as weekly_rest
    from filtered_personnel p
    left join monthly_records a on a.personnel_id = p.id
    group by p.id, p.full_name, p.phone, p.tc_identity_number, p.is_active,
      p.employment_start_date, p.employment_end_date
  )
  select jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'active_personnel_ids', (
      select coalesce(jsonb_agg(p.id order by p.full_name), '[]'::jsonb)
      from public.personnel p where p.is_active = true
    ),
    'personnel', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'full_name', full_name,
          'phone', phone,
          'tc_identity_number', tc_identity_number,
          'is_active', is_active,
          'employment_start_date', employment_start_date,
          'employment_end_date', employment_end_date,
          'records', records,
          'totals', jsonb_build_object(
            'worked', worked,
            'absent', absent,
            'unexcused_absence', unexcused_absence,
            'leave', leave,
            'medical_report', medical_report,
            'weekly_rest', weekly_rest
          )
        ) order by full_name
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from personnel_month;

  return v_result;
end;
$$;

revoke execute on function public.get_monthly_attendance(
  integer, integer, text, text, text
) from public, anon;
grant execute on function public.get_monthly_attendance(
  integer, integer, text, text, text
) to authenticated;
