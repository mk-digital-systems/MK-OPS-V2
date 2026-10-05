-- =============================================================================
-- 00013 — Aylık puantaj sistemi
-- 00012'den sonra çalıştırılmalıdır.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'attendance_status'
  ) then
    create type public.attendance_status as enum (
      'worked',
      'absent',
      'leave',
      'medical_report',
      'weekly_rest'
    );
  end if;
end
$$;

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  personnel_id uuid not null
    references public.personnel (id) on delete cascade,
  attendance_date date not null,
  status public.attendance_status not null,
  is_auto_generated boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_personnel_date_unique
    unique (personnel_id, attendance_date)
);

comment on table public.attendance_records is
  'Personel günlük puantaj kayıtları';
comment on column public.attendance_records.is_auto_generated is
  'Pazar günü sistem tarafından oluşturulan HT kaydını belirtir';

create index if not exists idx_attendance_date
  on public.attendance_records (attendance_date);
create index if not exists idx_attendance_personnel_month
  on public.attendance_records (personnel_id, attendance_date);

drop trigger if exists attendance_records_set_updated_at
  on public.attendance_records;
create trigger attendance_records_set_updated_at
before update on public.attendance_records
for each row execute function public.set_updated_at();

alter table public.attendance_records enable row level security;

grant usage on type public.attendance_status to authenticated;
grant select, insert, update, delete on public.attendance_records
  to authenticated;

drop policy if exists "attendance_select_authenticated"
  on public.attendance_records;
create policy "attendance_select_authenticated"
  on public.attendance_records for select
  to authenticated using (true);

drop policy if exists "attendance_insert_authenticated"
  on public.attendance_records;
create policy "attendance_insert_authenticated"
  on public.attendance_records for insert
  to authenticated with check (auth.uid() is not null);

drop policy if exists "attendance_update_authenticated"
  on public.attendance_records;
create policy "attendance_update_authenticated"
  on public.attendance_records for update
  to authenticated using (true) with check (true);

drop policy if exists "attendance_delete_authenticated"
  on public.attendance_records;
create policy "attendance_delete_authenticated"
  on public.attendance_records for delete
  to authenticated using (true);

create or replace function public.ensure_sunday_attendance_for_month(
  p_year integer,
  p_month integer
)
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_month_start date;
  v_month_end date;
  v_last_date date;
  v_inserted integer;
begin
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then
    raise exception 'Geçersiz ay veya yıl';
  end if;

  v_month_start := make_date(p_year, p_month, 1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;

  -- Geçmiş aylara sonradan otomatik kayıt ekleme; yalnız güncel ay işlenir.
  if date_trunc('month', current_date)::date <> v_month_start then
    return 0;
  end if;

  v_last_date := least(v_month_end, current_date);

  insert into public.attendance_records (
    personnel_id,
    attendance_date,
    status,
    is_auto_generated
  )
  select
    p.id,
    d.attendance_date,
    'weekly_rest'::public.attendance_status,
    true
  from public.personnel p
  cross join lateral (
    select generated_date::date as attendance_date
    from generate_series(
      v_month_start::timestamp,
      v_last_date::timestamp,
      interval '1 day'
    ) generated_date
    where extract(isodow from generated_date) = 7
  ) d
  where p.is_active = true
    and (p.created_at at time zone 'Europe/Istanbul')::date
      <= d.attendance_date
  on conflict (personnel_id, attendance_date) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.ensure_current_sunday_attendance()
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if extract(isodow from current_date) <> 7 then
    return 0;
  end if;

  return public.ensure_sunday_attendance_for_month(
    extract(year from current_date)::integer,
    extract(month from current_date)::integer
  );
end;
$$;

revoke execute on function public.ensure_sunday_attendance_for_month(integer, integer)
  from public, anon;
revoke execute on function public.ensure_current_sunday_attendance()
  from public, anon;
grant execute on function public.ensure_sunday_attendance_for_month(integer, integer)
  to authenticated;
grant execute on function public.ensure_current_sunday_attendance()
  to authenticated;

-- pg_cron etkinse her gün kontrol et; pazar değilse fonksiyon işlem yapmaz.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
    and not exists (
      select 1 from cron.job where jobname = 'azg-sunday-attendance'
    )
  then
    perform cron.schedule(
      'azg-sunday-attendance',
      '5 0 * * *',
      'select public.ensure_current_sunday_attendance();'
    );
  end if;
exception
  when undefined_table then
    null;
end
$$;

create or replace function public.get_monthly_attendance(
  p_year integer,
  p_month integer,
  p_active_filter text default 'active',
  p_search text default ''
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

  perform public.ensure_sunday_attendance_for_month(p_year, p_month);

  v_month_start := make_date(p_year, p_month, 1);
  v_month_end := (v_month_start + interval '1 month - 1 day')::date;

  with filtered_personnel as (
    select p.*
    from public.personnel p
    where (
      p_active_filter = 'all'
      or (p_active_filter = 'active' and p.is_active = true)
      or (p_active_filter = 'passive' and p.is_active = false)
    )
    and (
      trim(p_search) = ''
      or p.full_name ilike '%' || trim(p_search) || '%'
      or coalesce(p.phone, '') ilike '%' || trim(p_search) || '%'
    )
  ),
  monthly_records as (
    select a.*
    from public.attendance_records a
    where a.attendance_date between v_month_start and v_month_end
  ),
  personnel_month as (
    select
      p.id,
      p.full_name,
      p.phone,
      p.is_active,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'date', to_char(a.attendance_date, 'YYYY-MM-DD'),
            'status', a.status,
            'is_auto_generated', a.is_auto_generated
          )
          order by a.attendance_date
        ) filter (where a.id is not null),
        '[]'::jsonb
      ) as records,
      count(a.id) filter (where a.status = 'worked')::integer as worked,
      count(a.id) filter (where a.status = 'absent')::integer as absent,
      count(a.id) filter (where a.status = 'leave')::integer as leave,
      count(a.id) filter (where a.status = 'medical_report')::integer as medical_report,
      count(a.id) filter (where a.status = 'weekly_rest')::integer as weekly_rest
    from filtered_personnel p
    left join monthly_records a on a.personnel_id = p.id
    group by p.id, p.full_name, p.phone, p.is_active
  )
  select jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'active_personnel_ids', (
      select coalesce(jsonb_agg(p.id order by p.full_name), '[]'::jsonb)
      from public.personnel p
      where p.is_active = true
    ),
    'personnel', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'full_name', full_name,
          'phone', phone,
          'is_active', is_active,
          'records', records,
          'totals', jsonb_build_object(
            'worked', worked,
            'absent', absent,
            'leave', leave,
            'medical_report', medical_report,
            'weekly_rest', weekly_rest
          )
        )
        order by full_name
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from personnel_month;

  return v_result;
end;
$$;

revoke execute on function public.get_monthly_attendance(integer, integer, text, text)
  from public, anon;
grant execute on function public.get_monthly_attendance(integer, integer, text, text)
  to authenticated;

create or replace function public.save_attendance_changes(p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_change jsonb;
  v_personnel_id uuid;
  v_date date;
  v_status public.attendance_status;
  v_saved integer := 0;
  v_deleted integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Oturum gerekli' using errcode = '42501';
  end if;

  if jsonb_typeof(p_changes) <> 'array' then
    raise exception 'Puantaj değişiklikleri JSON dizisi olmalıdır';
  end if;

  if jsonb_array_length(p_changes) > 5000 then
    raise exception 'Tek işlemde en fazla 5000 puantaj hücresi kaydedilebilir';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes)
  loop
    begin
      v_personnel_id := (v_change->>'personnel_id')::uuid;
      v_date := (v_change->>'attendance_date')::date;

      if not exists (
        select 1 from public.personnel where id = v_personnel_id
      ) then
        raise exception 'Personel bulunamadı: %', v_personnel_id;
      end if;

      if v_change->>'status' is null then
        delete from public.attendance_records
        where personnel_id = v_personnel_id
          and attendance_date = v_date;
        v_deleted := v_deleted + 1;
      else
        v_status := (v_change->>'status')::public.attendance_status;

        insert into public.attendance_records (
          personnel_id,
          attendance_date,
          status,
          is_auto_generated,
          created_by,
          updated_by
        )
        values (
          v_personnel_id,
          v_date,
          v_status,
          false,
          auth.uid(),
          auth.uid()
        )
        on conflict (personnel_id, attendance_date)
        do update set
          status = excluded.status,
          is_auto_generated = false,
          updated_by = auth.uid();

        v_saved := v_saved + 1;
      end if;
    exception
      when others then
        raise exception 'Puantaj kaydedilemedi (% / %): %',
          coalesce(v_personnel_id::text, 'personel yok'),
          coalesce(v_date::text, 'tarih yok'),
          sqlerrm;
    end;
  end loop;

  return jsonb_build_object(
    'saved', v_saved,
    'deleted', v_deleted
  );
end;
$$;

revoke execute on function public.save_attendance_changes(jsonb)
  from public, anon;
grant execute on function public.save_attendance_changes(jsonb)
  to authenticated;
