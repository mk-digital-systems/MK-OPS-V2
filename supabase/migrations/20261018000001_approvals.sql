-- Onaylar: muhasebenin eklediği personel/araç ve ay sonu puantaj onayı
--
--   1. Muhasebenin eklediği personel ve araç "Onay bekliyor" olarak kaydedilir. Şantiye şefi
--      veya firma yöneticisi onaylayana kadar puantaja, iş planına ve yakıt kaydına giremez.
--      Reddedilen kayıt silinir. Muhasebe kendi eklediği bekleyen kaydı düzeltebilir/geri çekebilir.
--   2. Ay bittikten sonra şantiye şefi veya firma yöneticisi o ayın puantajını onaylar.
--      Onaylı ayın puantajı ve avansları değiştirilemez. Onayı yalnızca firma yöneticisi kaldırır;
--      kaldırılan onay da geçmişte kalır.
--   3. Bildirimler: onay bekleyen personel/araç ve onaylanmamış geçmiş ay puantajı.

-- 1. Personel ve araç onay durumu ------------------------------------------------------------

alter table public.personnel
  add column approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved')),
  add column approved_by uuid references auth.users (id) on delete set null,
  add column approved_at timestamptz;

alter table public.vehicles
  add column approval_status text not null default 'approved'
    check (approval_status in ('pending', 'approved')),
  add column approved_by uuid references auth.users (id) on delete set null,
  add column approved_at timestamptz;

comment on column public.personnel.approval_status is
  'pending: muhasebe ekledi, şantiye şefi/firma yöneticisi onayı bekliyor; approved: kullanımda';
comment on column public.vehicles.approval_status is
  'pending: muhasebe ekledi, şantiye şefi/firma yöneticisi onayı bekliyor; approved: kullanımda';

create index idx_personnel_pending on public.personnel (company_id) where approval_status = 'pending';
create index idx_vehicles_pending on public.vehicles (company_id) where approval_status = 'pending';

-- Onay verebilen roller: Firma Yöneticisi ve Şantiye Şefi.
create function public.can_review_records()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.current_user_role() in ('site_chief', 'company_manager'), false);
$$;

revoke all on function public.can_review_records() from public, anon;
grant execute on function public.can_review_records() to authenticated;

-- Eklemede onay durumu role göre belirlenir; sonradan yalnızca onay fonksiyonu değiştirebilir.
create function public.set_record_approval()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'INSERT' then
    if public.is_tenant_request() then
      new.created_by := auth.uid();
      if public.current_user_role() = 'accounting' then
        new.approval_status := 'pending';
        new.approved_by := null;
        new.approved_at := null;
      else
        new.approval_status := 'approved';
        new.approved_by := auth.uid();
        new.approved_at := now();
      end if;
    end if;
    return new;
  end if;

  if (new.approval_status, new.approved_by, new.approved_at)
       is distinct from (old.approval_status, old.approved_by, old.approved_at)
    and public.is_tenant_request()
    and coalesce(current_setting('mk_ops.record_review', true), '') <> 'on' then
    raise exception 'Onay durumu yalnızca onay işlemiyle değiştirilebilir' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.set_record_approval() from public, anon, authenticated;

create trigger a0_set_record_approval
before insert or update on public.personnel
for each row execute function public.set_record_approval();

create trigger a0_set_record_approval
before insert or update on public.vehicles
for each row execute function public.set_record_approval();

-- Muhasebe ekleyebilir (kayıt bekleyen olarak düşer); kendi bekleyen kaydını düzeltebilir.
drop policy if exists personnel_insert_module_write on public.personnel;
create policy personnel_insert_module_write on public.personnel
  for insert to authenticated
  with check (public.has_module_write_permission('personnel') or public.current_user_role() = 'accounting');

drop policy if exists personnel_update_module_write on public.personnel;
create policy personnel_update_module_write on public.personnel
  for update to authenticated
  using (
    public.has_module_write_permission('personnel')
    or (public.current_user_role() = 'accounting' and approval_status = 'pending' and created_by = auth.uid())
  )
  with check (
    public.has_module_write_permission('personnel')
    or (public.current_user_role() = 'accounting' and approval_status = 'pending' and created_by = auth.uid())
  );

drop policy if exists personnel_delete_module_write on public.personnel;
create policy personnel_delete_module_write on public.personnel
  for delete to authenticated
  using (
    public.has_module_write_permission('personnel')
    or (public.current_user_role() = 'accounting' and approval_status = 'pending' and created_by = auth.uid())
  );

drop policy if exists vehicles_insert_module_writer on public.vehicles;
create policy vehicles_insert_module_writer on public.vehicles
  for insert to authenticated
  with check (public.has_module_write_permission('vehicles') or public.current_user_role() = 'accounting');

drop policy if exists vehicles_update_module_writer on public.vehicles;
create policy vehicles_update_module_writer on public.vehicles
  for update to authenticated
  using (
    public.has_module_write_permission('vehicles')
    or (public.current_user_role() = 'accounting' and approval_status = 'pending' and created_by = auth.uid())
  )
  with check (
    public.has_module_write_permission('vehicles')
    or (public.current_user_role() = 'accounting' and approval_status = 'pending' and created_by = auth.uid())
  );

-- Onay / ret. Ret kaydı siler (bekleyen kayda henüz puantaj veya iş planı bağlanamaz).
create function public.review_pending_record(p_kind text, p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
begin
  if not public.can_review_records() or v_company is null then
    raise exception 'Onay için firma yöneticisi veya şantiye şefi yetkisi gerekli' using errcode = '42501';
  end if;
  if p_kind not in ('personnel', 'vehicle') then
    raise exception 'Geçersiz kayıt türü';
  end if;

  if p_kind = 'personnel' then
    perform 1 from public.personnel
    where id = p_id and company_id = v_company and approval_status = 'pending'
    for update;
  else
    perform 1 from public.vehicles
    where id = p_id and company_id = v_company and approval_status = 'pending'
    for update;
  end if;
  if not found then
    raise exception 'Onay bekleyen kayıt bulunamadı';
  end if;

  if p_approve then
    perform set_config('mk_ops.record_review', 'on', true);
    if p_kind = 'personnel' then
      update public.personnel
      set approval_status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_by = auth.uid()
      where id = p_id;
    else
      update public.vehicles
      set approval_status = 'approved', approved_by = auth.uid(), approved_at = now(), updated_by = auth.uid()
      where id = p_id;
    end if;
    perform set_config('mk_ops.record_review', 'off', true);
  elsif p_kind = 'personnel' then
    delete from public.personnel where id = p_id;
  else
    delete from public.vehicles where id = p_id;
  end if;
end;
$$;

revoke all on function public.review_pending_record(text, uuid, boolean) from public, anon;
grant execute on function public.review_pending_record(text, uuid, boolean) to authenticated;

-- Bekleyen personel/araç iş planına ve yakıt kaydına eklenemez.
create function public.guard_pending_references()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_personnel uuid := coalesce(v_row ->> 'personnel_id', v_row ->> 'chief_personnel_id')::uuid;
  v_vehicle uuid := (v_row ->> 'vehicle_id')::uuid;
begin
  if v_personnel is not null
    and exists (select 1 from public.personnel where id = v_personnel and approval_status = 'pending') then
    raise exception 'Onay bekleyen personel kullanılamaz; önce şantiye şefi veya firma yöneticisi onaylamalı';
  end if;
  if v_vehicle is not null
    and exists (select 1 from public.vehicles where id = v_vehicle and approval_status = 'pending') then
    raise exception 'Onay bekleyen araç kullanılamaz; önce şantiye şefi veya firma yöneticisi onaylamalı';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_pending_references() from public, anon, authenticated;

create trigger a1_guard_pending_references before insert or update on public.daily_work_plan_team_members
for each row execute function public.guard_pending_references();
create trigger a1_guard_pending_references before insert or update on public.daily_work_plan_teams
for each row execute function public.guard_pending_references();
create trigger a1_guard_pending_references before insert or update on public.daily_work_plan_absences
for each row execute function public.guard_pending_references();
create trigger a1_guard_pending_references before insert or update on public.vehicle_fuel_logs
for each row execute function public.guard_pending_references();
create trigger a1_guard_pending_references before insert or update on public.personnel_advances
for each row execute function public.guard_pending_references();

-- 2. Ay sonu puantaj onayı --------------------------------------------------------------------

create table public.attendance_month_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  approved_by uuid references auth.users (id) on delete set null,
  approved_by_name text,
  approved_at timestamptz not null default now(),
  reopened_by uuid references auth.users (id) on delete set null,
  reopened_by_name text,
  reopened_at timestamptz
);

create unique index attendance_month_approvals_active
  on public.attendance_month_approvals (company_id, year, month)
  where reopened_at is null;

comment on table public.attendance_month_approvals is
  'Ay sonu puantaj onayları; reopened_at boşsa ay kilitli. Kaldırılan onaylar geçmiş olarak kalır';

alter table public.attendance_month_approvals enable row level security;
revoke all on public.attendance_month_approvals from anon, authenticated;

create function public.attendance_month_is_locked(p_company_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1 from public.attendance_month_approvals a
    where a.company_id = p_company_id
      and a.year = extract(year from p_date)::integer
      and a.month = extract(month from p_date)::integer
      and a.reopened_at is null
  );
$$;

revoke all on function public.attendance_month_is_locked(uuid, date) from public, anon, authenticated;

-- Onaylı aydaki puantaj ve avans satırları değiştirilemez. Tarih kolonu tetikleyici argümanıdır.
create function public.guard_attendance_month_lock()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_column text := tg_argv[0];
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_date date;
begin
  if current_setting('mk_ops.allow_company_reset', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  foreach v_date in array array[(v_old ->> v_column)::date, (v_new ->> v_column)::date] loop
    continue when v_date is null;
    if public.attendance_month_is_locked(coalesce((v_new ->> 'company_id')::uuid, (v_old ->> 'company_id')::uuid), v_date) then
      raise exception '% puantajı onaylandı; değişiklik için firma yöneticisinin onayı kaldırması gerekir',
        to_char(v_date, 'MM.YYYY');
    end if;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.guard_attendance_month_lock() from public, anon, authenticated;

create trigger a1_attendance_month_lock before insert or update or delete on public.attendance_records
for each row execute function public.guard_attendance_month_lock('attendance_date');
create trigger a1_attendance_month_lock before insert or update or delete on public.personnel_advances
for each row execute function public.guard_attendance_month_lock('advance_date');

create function public.get_attendance_month_approval(p_year integer, p_month integer)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case when public.can_view_personnel_attendance() then (
    select jsonb_build_object(
      'approved_at', a.approved_at,
      'approved_by_name', a.approved_by_name
    )
    from public.attendance_month_approvals a
    where a.company_id = public.current_company_id()
      and a.year = p_year and a.month = p_month and a.reopened_at is null
  ) end;
$$;

create function public.approve_attendance_month(p_year integer, p_month integer)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
  v_month_end date;
  v_today date := timezone('Europe/Istanbul', now())::date;
begin
  if not public.can_review_records() or v_company is null then
    raise exception 'Puantaj onayı için firma yöneticisi veya şantiye şefi yetkisi gerekli' using errcode = '42501';
  end if;
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then
    raise exception 'Geçersiz ay veya yıl';
  end if;
  v_month_end := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  if v_today < v_month_end then
    raise exception 'Ay bitmeden puantaj onaylanamaz (son gün: %)', to_char(v_month_end, 'DD.MM.YYYY');
  end if;

  insert into public.attendance_month_approvals (company_id, year, month, approved_by, approved_by_name)
  select v_company, p_year, p_month, auth.uid(), coalesce(nullif(p.full_name, ''), p.email)
  from public.profiles p where p.id = auth.uid()
  on conflict (company_id, year, month) where reopened_at is null do nothing;
  if not found then
    raise exception 'Bu ayın puantajı zaten onaylanmış';
  end if;

  return public.get_attendance_month_approval(p_year, p_month);
end;
$$;

create function public.reopen_attendance_month(p_year integer, p_month integer)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.is_site_chief() then
    raise exception 'Puantaj onayını yalnızca firma yöneticisi kaldırabilir' using errcode = '42501';
  end if;

  update public.attendance_month_approvals a
  set reopened_at = now(),
      reopened_by = auth.uid(),
      reopened_by_name = (select coalesce(nullif(p.full_name, ''), p.email) from public.profiles p where p.id = auth.uid())
  where a.company_id = public.current_company_id()
    and a.year = p_year and a.month = p_month and a.reopened_at is null;
  if not found then
    raise exception 'Bu ay için onaylı puantaj yok';
  end if;
end;
$$;

revoke all on function public.get_attendance_month_approval(integer, integer) from public, anon;
revoke all on function public.approve_attendance_month(integer, integer) from public, anon;
revoke all on function public.reopen_attendance_month(integer, integer) from public, anon;
grant execute on function public.get_attendance_month_approval(integer, integer) to authenticated;
grant execute on function public.approve_attendance_month(integer, integer) to authenticated;
grant execute on function public.reopen_attendance_month(integer, integer) to authenticated;

-- 3. Mevcut fonksiyonlar: bekleyen personel puantajda yer almaz, onaylı ay atlanır ----------------

-- Bekleyen personele puantaj girilmez
CREATE OR REPLACE FUNCTION public.guard_attendance_employment_period()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_personnel_id uuid := case when tg_op = 'DELETE' then old.personnel_id else new.personnel_id end;
  v_attendance_date date := case when tg_op = 'DELETE' then old.attendance_date else new.attendance_date end;
begin
  if exists (select 1 from public.personnel p where p.id = v_personnel_id and p.approval_status = 'pending') then
    raise exception 'Onay bekleyen personel için puantaj girilemez';
  end if;

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
$function$;

-- Aylık puantaj: yalnızca onaylı personel
CREATE OR REPLACE FUNCTION public.get_monthly_attendance(p_year integer, p_month integer, p_active_filter text DEFAULT 'active'::text, p_search text DEFAULT ''::text, p_status_filter text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
    where p.approval_status = 'approved'
    and (
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
      from public.personnel p where p.is_active = true and p.approval_status = 'approved'
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
$function$;

-- Pazar hafta tatili: bekleyen personel ve onaylı ay atlanır
CREATE OR REPLACE FUNCTION public.ensure_sunday_attendance_for_month(p_year integer, p_month integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
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
  insert into public.attendance_records(company_id,personnel_id,attendance_date,status,is_auto_generated)
  select p.company_id,p.id,d.attendance_date,'weekly_rest'::public.attendance_status,true
  from public.personnel p
  cross join lateral (
    select generated_date::date attendance_date
    from generate_series(v_month_start::timestamp,v_last_date::timestamp,interval '1 day') generated_date
    where extract(isodow from generated_date)=7
  ) d
  where (auth.uid() is null or p.company_id = public.current_company_id())
    and p.approval_status = 'approved'
    and not public.attendance_month_is_locked(p.company_id, d.attendance_date)
    and coalesce(p.employment_start_date,(p.created_at at time zone 'Europe/Istanbul')::date)<=d.attendance_date
    and (p.employment_end_date is null or p.employment_end_date>=d.attendance_date)
  on conflict(personnel_id,attendance_date) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$function$;

-- Aylık hakediş/maaş dökümü: yalnızca onaylı personel
CREATE OR REPLACE FUNCTION public.get_monthly_payroll(p_year integer, p_month integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
  ) v on true
  where p.approval_status = 'approved';
  return v_result;
end;
$function$;

-- Puantaj arşivi: yalnızca onaylı personel sayılır
CREATE OR REPLACE FUNCTION public.get_attendance_month_archives()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with months as (
    select
      date_trunc('month', a.attendance_date)::date as month_start,
      count(*) filter (where a.status = 'worked')::integer as worked,
      count(*) filter (where a.status = 'absent')::integer as absent,
      count(*) filter (where a.status = 'leave')::integer as leave,
      count(*) filter (where a.status = 'medical_report')::integer as medical_report,
      count(*) filter (where a.status = 'weekly_rest')::integer as weekly_rest,
      count(distinct a.attendance_date) filter (
        where a.status = 'worked'
          and extract(isodow from a.attendance_date) = 7
      )::integer as sunday_worked
    from public.attendance_records a
    where a.attendance_date <= (now() at time zone 'Europe/Istanbul')::date
    group by date_trunc('month', a.attendance_date)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'year', extract(year from m.month_start)::integer,
        'month', extract(month from m.month_start)::integer,
        'active_personnel', (
          select count(*)::integer
          from public.personnel p
          where p.approval_status = 'approved'
          and coalesce(
            p.employment_start_date,
            (p.created_at at time zone 'Europe/Istanbul')::date
          ) <= (m.month_start + interval '1 month - 1 day')::date
          and (
            p.employment_end_date is null
            or p.employment_end_date >= m.month_start
          )
        ),
        'worked', m.worked,
        'absent', m.absent,
        'leave', m.leave,
        'medical_report', m.medical_report,
        'weekly_rest', m.weekly_rest,
        'sunday_worked', m.sunday_worked
      ) order by m.month_start desc
    ),
    '[]'::jsonb
  )
  from months m;
$function$;

-- Bildirimler: onay bekleyen personel/araç ve onaylanmamış geçen ay puantajı
CREATE OR REPLACE FUNCTION public.get_my_notifications()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_company uuid := public.current_company_id();
  v_today date := timezone('Europe/Istanbul', now())::date;
  v_chief boolean;
  v_users boolean;
  v_projects boolean;
  v_vehicles boolean;
  v_hakedis boolean;
begin
  if auth.uid() is null or v_company is null or public.current_user_role() = 'pending' then
    return '[]'::jsonb;
  end if;
  v_chief := public.is_site_chief();
  v_users := public.can_manage_users();
  v_projects := public.can_view_all() or public.has_module_write_permission('projects');
  v_vehicles := public.can_view_all() or public.has_module_write_permission('vehicles');
  v_hakedis := public.has_module_write_permission('hakedis');

  return (
    with items as (
      -- Katılım isteği
      select 'join:' || p.id as key, 'join_request' as type, 'Katılım isteği' as title,
             coalesce(nullif(p.full_name, ''), p.email) || ' firmanıza katılmak istiyor.' as body,
             '/panel/users' as link, p.created_at as at
      from public.profiles p
      where v_users and p.company_id = v_company and not p.is_approved and p.role = 'pending'

      union all
      -- Onay bekleyen personel / araç (muhasebenin eklediği)
      select 'pending_' || x.kind || ':' || x.n || ':' || extract(epoch from x.at)::bigint, 'pending_approval',
             case x.kind when 'personnel' then 'Onay bekleyen personel' else 'Onay bekleyen araç' end,
             x.n || case x.kind when 'personnel' then ' personel' else ' araç' end || ' kaydı onayınızı bekliyor.',
             case x.kind when 'personnel' then '/panel/personnel' else '/panel/vehicles' end, x.at
      from (
        select 'personnel' as kind, count(*) as n, max(created_at) as at
        from public.personnel where company_id = v_company and approval_status = 'pending'
        union all
        select 'vehicle', count(*), max(created_at)
        from public.vehicles where company_id = v_company and approval_status = 'pending'
      ) x
      where v_users and x.n > 0

      union all
      -- Geçen ayın puantajı onaylanmadı
      select 'attendance_month:' || to_char(m.month_start, 'YYYY-MM'), 'attendance_approval', 'Puantaj onayı bekliyor',
             to_char(m.month_start, 'MM.YYYY') || ' puantajı henüz onaylanmadı. Onaylanınca ay kesinleşir.',
             '/panel/attendance?year=' || extract(year from m.month_start)::integer || '&month=' || extract(month from m.month_start)::integer,
             (m.month_start + interval '1 month')::timestamptz
      from (select (date_trunc('month', v_today) - interval '1 month')::date as month_start) m
      where v_users
        and exists (
          select 1 from public.attendance_records a
          where a.company_id = v_company
            and a.attendance_date >= m.month_start and a.attendance_date < m.month_start + interval '1 month')
        and not public.attendance_month_is_locked(v_company, m.month_start)

      union all
      -- Destek talebi yanıtı (son 30 gün)
      select 'support:' || s.id || ':' || extract(epoch from s.replied_at)::bigint, 'support_reply',
             'Destek talebiniz yanıtlandı', left(coalesce(s.admin_reply, ''), 160), '/panel/support', s.replied_at
      from public.support_requests s
      where v_chief and s.company_id = v_company and s.replied_at is not null and s.replied_at > now() - interval '30 days'

      union all
      -- Geciken proje
      select 'project_delayed:' || p.id || ':' || coalesce(p.estimated_end_date::text, ''), 'project_delayed', 'Proje gecikti',
             concat_ws(' · ', p.name, p.project_code) || coalesce(' — planlanan bitiş ' || to_char(p.estimated_end_date, 'DD.MM.YYYY'), ''),
             '/panel/projects/' || p.id, coalesce(p.estimated_end_date + 1, p.delayed_at, v_today)::timestamptz
      from public.projects p
      where v_projects and p.company_id = v_company and not p.is_cancelled and not p.is_archived
        and p.status <> 'completed'
        and (p.status = 'delayed' or p.estimated_end_date < v_today)

      union all
      -- Bitişi 3 gün içinde olan proje
      select 'project_due:' || p.id || ':' || p.estimated_end_date, 'project_due', 'Proje bitişi yaklaşıyor',
             concat_ws(' · ', p.name, p.project_code) || ' — planlanan bitiş ' || to_char(p.estimated_end_date, 'DD.MM.YYYY'),
             '/panel/projects/' || p.id, (p.estimated_end_date - 3)::timestamptz
      from public.projects p
      where v_projects and p.company_id = v_company and not p.is_cancelled and not p.is_archived
        and p.status not in ('completed', 'delayed')
        and p.estimated_end_date between v_today and v_today + 3

      union all
      -- Araç muayene / sigorta (15 gün içinde veya geçmiş)
      select 'vehicle_' || d.kind || ':' || v.id || ':' || d.due, 'vehicle_deadline',
             case d.kind when 'inspection' then 'Araç muayenesi' else 'Araç sigortası' end
               || case when d.due < v_today then ' tarihi geçti' else ' yaklaşıyor' end,
             v.plate || ' — ' || to_char(d.due, 'DD.MM.YYYY'), '/panel/vehicles', (d.due - 15)::timestamptz
      from public.vehicles v
      cross join lateral (values ('inspection', v.inspection_date), ('insurance', v.insurance_date)) as d(kind, due)
      where v_vehicles and v.company_id = v_company and d.due is not null and d.due <= v_today + 15

      union all
      -- Deneme süresi son 24 saat
      select 'trial_end:' || extract(epoch from c.trial_ends_at)::bigint, 'subscription', 'Deneme süresi bitiyor',
             'Deneme süreniz ' || to_char(timezone('Europe/Istanbul', c.trial_ends_at), 'DD.MM.YYYY HH24:MI')
               || ' tarihinde bitiyor. Plan talebi için Destek sayfasını kullanın.',
             '/panel/support', c.trial_ends_at - interval '24 hours'
      from public.companies c
      where v_chief and c.id = v_company and c.plan is null
        and c.trial_ends_at between now() and now() + interval '24 hours'

      union all
      -- Plan bitişi son 7 gün
      select 'plan_end:' || extract(epoch from c.plan_ends_at)::bigint, 'subscription', 'Plan süresi bitiyor',
             'Planınız ' || to_char(timezone('Europe/Istanbul', c.plan_ends_at), 'DD.MM.YYYY') || ' tarihinde bitiyor. Yenilemek için Destek sayfasını kullanın.',
             '/panel/support', c.plan_ends_at - interval '7 days'
      from public.companies c
      where v_chief and c.id = v_company and c.plan is not null and c.plan_ends_at is not null
        and c.plan_ends_at between now() and now() + interval '7 days'

      union all
      -- Fiyatı girilmemiş hakediş kayıtları (son 31 gün)
      select 'hakedis_unpriced:' || u.n, 'hakedis_unpriced', 'Fiyatı girilmemiş kayıtlar',
             u.n || ' iş kaydının veya ek işin fiyatı girilmemiş; hakediş toplamına dahil değil.',
             '/panel/hakedis', now()
      from (
        select (
          (select count(*) from public.project_stage_logs l
           left join public.hakedis_log_values hv on hv.log_id = l.id
           where l.company_id = v_company and l.quantity is not null and hv.log_id is null
             and l.log_date >= v_today - 31)
          +
          (select count(*) from public.production_items i
           join public.production_jobs j on j.id = i.production_job_id
           join public.production_entries e on e.id = j.production_entry_id
           left join public.hakedis_extra_values x on x.production_item_id = i.id
           where i.company_id = v_company and i.kind = 'extra' and x.production_item_id is null
             and e.work_date >= v_today - 31)
        ) as n
      ) u
      where v_hakedis and u.n > 0
    ),
    latest as (
      select * from items order by at desc limit 50
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'key', l.key, 'type', l.type, 'title', l.title, 'body', l.body, 'link', l.link, 'at', l.at,
      'read', r.key is not null
    ) order by l.at desc), '[]'::jsonb)
    from latest l
    left join public.notification_reads r on r.user_id = auth.uid() and r.key = l.key
  );
end;
$function$;
