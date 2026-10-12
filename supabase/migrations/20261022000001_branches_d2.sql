-- Şubeler (D2)
--
--   1. Günlük iş planı şube bazında: her şubenin günde bir planı (taslaklar da şubeye bağlı).
--   2. İmalat kaydı ekip başının şubesini tutar; imalat, hakediş ve raporlar şubeye göre süzülür.
--   3. Ay sonu puantaj onayı şube bazında; kilit personelin şubesine göre.
--   4. Hakediş raporu/özeti, Genel Bakış, bildirimler ve taşeronlar kullanıcının erişebildiği şubelerle
--      sınırlı; isteğe bağlı şube süzgeci (menüde seçili şube).
--   5. Depo şubeye bağlı (depo formunda seçilir); stok çıkışı/sevkiyat yalnızca erişilebilen depodan,
--      depo stokları yalnızca erişilebilen depolarda görünür. Başka şubenin deposuna sevkiyat serbest.

-- 1. Günlük iş planı ve taslaklar şubeye bağlı ------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array['daily_work_plans', 'daily_work_plan_drafts'] loop
    execute format('alter table public.%I add column branch_id uuid', v_table);
    execute format('alter table public.%I disable trigger user', v_table);
    execute format('update public.%I t set branch_id = public.company_main_branch(t.company_id)', v_table);
    execute format('alter table public.%I enable trigger user', v_table);
    execute format('alter table public.%I alter column branch_id set not null', v_table);
    execute format('alter table public.%I add constraint %I foreign key (company_id, branch_id)
      references public.branches (company_id, id)', v_table, v_table || '_branch_fkey');
    execute format('create index %I on public.%I (branch_id)', 'idx_' || v_table || '_branch', v_table);
    execute format('create trigger a0_set_default_branch before insert on public.%I
      for each row execute function public.set_default_branch()', v_table);
    execute format('create trigger a1_guard_branch_write before insert or update or delete on public.%I
      for each row execute function public.guard_branch_write(%L)', v_table, 'self');
    execute format($p$create policy branch_isolation on public.%I as restrictive for all to authenticated
      using (public.can_access_branch(branch_id))
      with check (public.can_access_branch(branch_id))$p$, v_table);
  end loop;
end $$;

-- Her şubenin günde bir planı.
alter table public.daily_work_plans drop constraint daily_work_plans_date_unique;
alter table public.daily_work_plans add constraint daily_work_plans_branch_date_unique unique (company_id, branch_id, plan_date);

create policy branch_isolation on public.daily_work_plan_teams as restrictive for all to authenticated
  using (exists (select 1 from public.daily_work_plans w where w.id = plan_id))
  with check (exists (select 1 from public.daily_work_plans w where w.id = plan_id));
create policy branch_isolation on public.daily_work_plan_absences as restrictive for all to authenticated
  using (exists (select 1 from public.daily_work_plans w where w.id = work_plan_id))
  with check (exists (select 1 from public.daily_work_plans w where w.id = work_plan_id));
create policy branch_isolation on public.daily_work_plan_team_members as restrictive for all to authenticated
  using (exists (select 1 from public.daily_work_plan_teams t where t.id = team_id))
  with check (exists (select 1 from public.daily_work_plan_teams t where t.id = team_id));

-- 2. İmalat kaydı ekip başının şubesini tutar -------------------------------------------------------

alter table public.production_entries add column branch_id uuid;
alter table public.production_entries disable trigger user;
update public.production_entries e
set branch_id = coalesce(
  (select p.branch_id from public.personnel p where p.id = e.team_leader_personnel_id),
  public.company_main_branch(e.company_id));
alter table public.production_entries enable trigger user;
alter table public.production_entries alter column branch_id set not null;
alter table public.production_entries add constraint production_entries_branch_fkey
  foreign key (company_id, branch_id) references public.branches (company_id, id);
create index idx_production_entries_branch on public.production_entries (branch_id, work_date);

comment on column public.production_entries.branch_id is 'Ekip başının şubesi (imalat girildiğinde)';

create function public.production_entry_set_branch()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'INSERT' or new.team_leader_personnel_id is distinct from old.team_leader_personnel_id then
    new.branch_id := coalesce(
      (select p.branch_id from public.personnel p where p.id = new.team_leader_personnel_id),
      public.company_main_branch(new.company_id));
  else
    new.branch_id := old.branch_id;
  end if;
  return new;
end;
$$;

revoke all on function public.production_entry_set_branch() from public, anon, authenticated;

create trigger a2_production_entry_set_branch
before insert or update on public.production_entries
for each row execute function public.production_entry_set_branch();

-- 3. Ay sonu puantaj onayı şube bazında -------------------------------------------------------------

alter table public.attendance_month_approvals add column branch_id uuid;
update public.attendance_month_approvals a set branch_id = public.company_main_branch(a.company_id);
alter table public.attendance_month_approvals alter column branch_id set not null;
alter table public.attendance_month_approvals add constraint attendance_month_approvals_branch_fkey
  foreign key (company_id, branch_id) references public.branches (company_id, id) on delete cascade;
drop index public.attendance_month_approvals_active;
create unique index attendance_month_approvals_active
  on public.attendance_month_approvals (company_id, branch_id, year, month)
  where reopened_at is null;

-- Kilit: şubenin o ayı onaylı mı.
create function public.attendance_month_is_locked(p_company_id uuid, p_branch_id uuid, p_date date)
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
      and a.branch_id = p_branch_id
      and a.year = extract(year from p_date)::integer
      and a.month = extract(month from p_date)::integer
      and a.reopened_at is null
  );
$$;

revoke all on function public.attendance_month_is_locked(uuid, uuid, date) from public, anon, authenticated;

-- Puantaj ve avans satırları: personelin şubesinin o ayı onaylıysa değiştirilemez.
create or replace function public.guard_attendance_month_lock()
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
  v_row jsonb;
  v_date date;
  v_branch uuid;
begin
  if current_setting('mk_ops.allow_company_reset', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  foreach v_row in array array[v_old, v_new] loop
    continue when v_row is null;
    v_date := (v_row ->> v_column)::date;
    select p.branch_id into v_branch from public.personnel p where p.id = (v_row ->> 'personnel_id')::uuid;
    continue when v_date is null or v_branch is null;
    if public.attendance_month_is_locked((v_row ->> 'company_id')::uuid, v_branch, v_date) then
      raise exception '% puantajı onaylandı; değişiklik için firma yöneticisinin onayı kaldırması gerekir',
        to_char(v_date, 'MM.YYYY');
    end if;
  end loop;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Şube verilmezse kullanıcının tek şubesi; birden fazlaysa şube seçilmelidir.
create function public.resolve_user_branch(p_branch_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_branch uuid := p_branch_id;
begin
  if v_branch is null then
    select b.id into v_branch from public.branches b
    where b.company_id = public.current_company_id() and public.can_access_branch(b.id)
    order by b.is_main desc, b.sort_order
    limit 2;
    if (select count(*) from public.branches b
        where b.company_id = public.current_company_id() and public.can_access_branch(b.id)) > 1 then
      raise exception 'Şube seçin';
    end if;
  end if;
  if v_branch is null or not public.can_access_branch(v_branch) then
    raise exception 'Şube bulunamadı' using errcode = '42501';
  end if;
  return v_branch;
end;
$$;

revoke all on function public.resolve_user_branch(uuid) from public, anon, authenticated;

drop function public.get_attendance_month_approval(integer, integer);
drop function public.approve_attendance_month(integer, integer);
drop function public.reopen_attendance_month(integer, integer);

-- Erişilebilen şubelerin bu aydaki onay durumu.
create function public.get_attendance_month_approvals(p_year integer, p_month integer)
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case when public.can_view_personnel_attendance() then coalesce((
    select jsonb_agg(jsonb_build_object(
      'branch_id', b.id,
      'branch_name', b.name,
      'approved_at', a.approved_at,
      'approved_by_name', a.approved_by_name
    ) order by b.is_main desc, b.sort_order, b.name)
    from public.branches b
    left join public.attendance_month_approvals a
      on a.branch_id = b.id and a.year = p_year and a.month = p_month and a.reopened_at is null
    where b.company_id = public.current_company_id() and public.can_access_branch(b.id)
  ), '[]'::jsonb) end;
$$;

create function public.approve_attendance_month(p_year integer, p_month integer, p_branch_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
  v_branch uuid;
  v_month_end date;
  v_today date := timezone('Europe/Istanbul', now())::date;
begin
  if not public.can_review_records() or v_company is null then
    raise exception 'Puantaj onayı için firma yöneticisi veya şantiye şefi yetkisi gerekli' using errcode = '42501';
  end if;
  if p_year < 2000 or p_year > 2100 or p_month < 1 or p_month > 12 then
    raise exception 'Geçersiz ay veya yıl';
  end if;
  v_branch := public.resolve_user_branch(p_branch_id);
  v_month_end := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  if v_today < v_month_end then
    raise exception 'Ay bitmeden puantaj onaylanamaz (son gün: %)', to_char(v_month_end, 'DD.MM.YYYY');
  end if;

  insert into public.attendance_month_approvals (company_id, branch_id, year, month, approved_by, approved_by_name)
  select v_company, v_branch, p_year, p_month, auth.uid(), coalesce(nullif(p.full_name, ''), p.email)
  from public.profiles p where p.id = auth.uid()
  on conflict (company_id, branch_id, year, month) where reopened_at is null do nothing;
  if not found then
    raise exception 'Bu şubenin bu ay puantajı zaten onaylanmış';
  end if;
end;
$$;

create function public.reopen_attendance_month(p_year integer, p_month integer, p_branch_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_branch uuid;
begin
  if not public.is_site_chief() then
    raise exception 'Puantaj onayını yalnızca firma yöneticisi kaldırabilir' using errcode = '42501';
  end if;
  v_branch := public.resolve_user_branch(p_branch_id);

  update public.attendance_month_approvals a
  set reopened_at = now(),
      reopened_by = auth.uid(),
      reopened_by_name = (select coalesce(nullif(p.full_name, ''), p.email) from public.profiles p where p.id = auth.uid())
  where a.company_id = public.current_company_id() and a.branch_id = v_branch
    and a.year = p_year and a.month = p_month and a.reopened_at is null;
  if not found then
    raise exception 'Bu şube için bu ay onaylı puantaj yok';
  end if;
end;
$$;

revoke all on function public.get_attendance_month_approvals(integer, integer) from public, anon;
revoke all on function public.approve_attendance_month(integer, integer, uuid) from public, anon;
revoke all on function public.reopen_attendance_month(integer, integer, uuid) from public, anon;
grant execute on function public.get_attendance_month_approvals(integer, integer) to authenticated;
grant execute on function public.approve_attendance_month(integer, integer, uuid) to authenticated;
grant execute on function public.reopen_attendance_month(integer, integer, uuid) to authenticated;

-- 4. Depo: şube seçimi, çıkış yalnızca erişilebilen depodan -----------------------------------------

create function public.inventory_require_branch_access(p_location_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.can_access_branch((select l.branch_id from public.inventory_locations l where l.id = p_location_id)) then
    raise exception 'Bu depo erişiminiz olmayan bir şubeye ait' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.inventory_require_branch_access(uuid) from public, anon, authenticated;

-- Depo stokları yalnızca erişilebilen depolarda görünür (depo adları herkese açık).
create policy branch_isolation on public.inventory_location_stocks as restrictive for all to authenticated
  using (public.can_access_branch((select l.branch_id from public.inventory_locations l where l.id = location_id)));

drop function public.save_inventory_location(uuid, text);
create function public.save_inventory_location(p_id uuid, p_name text, p_branch_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
  v_name text := trim(coalesce(p_name, ''));
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'Depo adı en az 2 karakter olmalı'; end if;
  if p_branch_id is not null and not public.can_access_branch(p_branch_id) then
    raise exception 'Şube bulunamadı' using errcode = '42501';
  end if;
  perform public.inventory_main_location(public.current_company_id());
  if exists (select 1 from public.inventory_locations where company_id = public.current_company_id()
             and lower(trim(name)) = lower(v_name) and id is distinct from p_id) then
    raise exception 'Bu adla bir depo zaten var';
  end if;
  if p_id is null then
    insert into public.inventory_locations (company_id, name, is_main, sort_order, branch_id)
    values (public.current_company_id(), v_name, false,
      coalesce((select max(sort_order) + 1 from public.inventory_locations where company_id = public.current_company_id()), 1),
      p_branch_id)
    returning id into v_id;
  else
    update public.inventory_locations set name = v_name, branch_id = coalesce(p_branch_id, branch_id)
    where id = p_id and company_id = public.current_company_id() returning id into v_id;
    if v_id is null then raise exception 'Depo bulunamadı'; end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.save_inventory_location(uuid, text, uuid) from public, anon;
grant execute on function public.save_inventory_location(uuid, text, uuid) to authenticated;

-- 5. Mevcut fonksiyonlar: şube süzgeci ve erişim (aşağıda) ------------------------------------------

-- Aylık puantaj: menüde seçili şube
drop function public.get_monthly_attendance(integer, integer, text, text, text);
CREATE FUNCTION public.get_monthly_attendance(p_year integer, p_month integer, p_active_filter text DEFAULT 'active'::text, p_search text DEFAULT ''::text, p_status_filter text DEFAULT 'all'::text, p_branch_id uuid DEFAULT NULL::uuid)
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
    and (p_branch_id is null or p.branch_id = p_branch_id)
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
      p.employment_start_date, p.employment_end_date, p.subcontractor_id,
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
      p.employment_start_date, p.employment_end_date, p.subcontractor_id
  )
  select jsonb_build_object(
    'year', p_year,
    'month', p_month,
    'active_personnel_ids', (
      select coalesce(jsonb_agg(p.id order by p.full_name), '[]'::jsonb)
      from public.personnel p where p.is_active = true and p.approval_status = 'approved' and (p_branch_id is null or p.branch_id = p_branch_id)
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
          'subcontractor_id', subcontractor_id,
          'subcontractor_name', (select s.name from public.subcontractors s where s.id = subcontractor_id),
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
revoke all on function public.get_monthly_attendance(integer, integer, text, text, text, uuid) from public, anon;
grant execute on function public.get_monthly_attendance(integer, integer, text, text, text, uuid) to authenticated;

-- Pazar hafta tatili: şube bazında ay kilidi
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
  where (auth.uid() is null or (p.company_id = public.current_company_id() and public.can_access_branch(p.branch_id)))
    and p.approval_status = 'approved'
    and not public.attendance_month_is_locked(p.company_id, p.branch_id, d.attendance_date)
    and coalesce(p.employment_start_date,(p.created_at at time zone 'Europe/Istanbul')::date)<=d.attendance_date
    and (p.employment_end_date is null or p.employment_end_date>=d.attendance_date)
  on conflict(personnel_id,attendance_date) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$function$;

-- Hakediş raporu: erişilebilen şubeler + şube süzgeci
drop function public.get_hakedis_report(date, date);
CREATE FUNCTION public.get_hakedis_report(p_start date, p_end date, p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_company_id uuid := public.current_company_id();
begin
  if v_company_id is null or not public.has_module_write_permission('hakedis') then
    raise exception 'Hakediş raporu için yetki gerekli' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Geçersiz tarih aralığı';
  end if;

  return (
    with report_rows as (
      select
        l.id, 'stage'::text as kind, l.log_date, l.quantity, l.team_leader_name, l.notes,
        v.unit_price, v.amount,
        st.id as stage_id, st.name as stage_name, st.unit, st.sort_order,
        t.name as type_name, t.name as group_name,
        p.id as project_id, p.project_code, p.name as project_name,
        s.name as section_name
      from public.project_stage_logs l
      join public.project_stage_progress sp on sp.id = l.progress_id
      join public.project_type_stages st on st.id = sp.stage_id
      join public.project_types t on t.id = st.project_type_id
      join public.projects p on p.id = sp.project_id
      left join public.project_sections s on s.id = sp.section_id
      left join public.hakedis_log_values v on v.log_id = l.id
      where l.company_id = v_company_id
        and l.log_date between p_start and p_end
        and public.can_access_branch(p.branch_id)
        and (p_branch_id is null or p.branch_id = p_branch_id)
        and l.quantity is not null
      union all
      select
        i.id, 'extra', e.work_date, i.quantity, e.team_leader_name_snapshot, null,
        x.unit_price, x.amount,
        null, i.item_name_snapshot, i.unit_snapshot, 9999,
        coalesce(t.name, 'Projesiz'), 'Ek işler',
        j.project_id, coalesce(p.project_code, j.project_code_snapshot, '—'), coalesce(p.name, j.project_name_snapshot),
        null
      from public.production_items i
      join public.production_jobs j on j.id = i.production_job_id
      join public.production_entries e on e.id = j.production_entry_id
      left join public.projects p on p.id = j.project_id
      left join public.project_types t on t.id = p.project_type_id
      left join public.hakedis_extra_values x on x.production_item_id = i.id
      where i.company_id = v_company_id
        and i.kind = 'extra'
        and e.work_date between p_start and p_end
        and public.can_access_branch(coalesce(p.branch_id, e.branch_id))
        and (p_branch_id is null or coalesce(p.branch_id, e.branch_id) = p_branch_id)
    )
    select jsonb_build_object(
      'start', p_start,
      'end', p_end,
      'total_amount', coalesce((select sum(amount) from report_rows), 0),
      'priced_count', (select count(*) from report_rows where amount is not null),
      'unpriced_count', (select count(*) from report_rows where amount is null),
      'by_project', coalesce((
        select jsonb_agg(x order by x.amount desc nulls last) from (
          select project_id, project_code, project_name, min(type_name) as type_name,
                 coalesce(sum(amount), 0) as amount, count(*) filter (where amount is null) as unpriced
          from report_rows group by project_id, project_code, project_name
        ) x
      ), '[]'::jsonb),
      'by_stage', coalesce((
        select jsonb_agg(x order by x.sort_order, x.type_name, x.stage_name) from (
          select group_name as type_name, stage_id, stage_name, unit, min(sort_order) as sort_order,
                 sum(quantity) as quantity, coalesce(sum(amount), 0) as amount,
                 count(*) filter (where amount is null) as unpriced
          from report_rows group by group_name, stage_id, stage_name, unit
        ) x
      ), '[]'::jsonb),
      'by_leader', coalesce((
        select jsonb_agg(x order by x.amount desc) from (
          select coalesce(team_leader_name, 'Belirtilmemiş') as team_leader_name,
                 coalesce(sum(amount), 0) as amount, count(*) as log_count
          from report_rows group by coalesce(team_leader_name, 'Belirtilmemiş')
        ) x
      ), '[]'::jsonb),
      'rows', coalesce((
        select jsonb_agg(x order by x.log_date, x.project_code) from (
          select id, kind, log_date, project_id, project_code, project_name, section_name,
                 stage_name, unit, quantity, unit_price, amount, team_leader_name, notes
          from report_rows
          order by log_date, project_code
          limit 5000
        ) x
      ), '[]'::jsonb)
    )
  );
end;
$function$;
revoke all on function public.get_hakedis_report(date, date, uuid) from public, anon;
grant execute on function public.get_hakedis_report(date, date, uuid) to authenticated;

-- Hakediş özeti (Genel Bakış kartı): erişilebilen şubeler + şube süzgeci
drop function public.get_hakedis_summary();
CREATE FUNCTION public.get_hakedis_summary(p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_company public.companies;
  v_today date := timezone('Europe/Istanbul', now())::date;
  v_period_start date;
  v_period_end date;
begin
  if public.current_company_id() is null or not public.has_module_write_permission('hakedis') then
    return null;
  end if;
  select * into v_company from public.companies where id = public.current_company_id();

  v_period_start := case
    when extract(day from v_today) >= v_company.payroll_start_day
      then make_date(extract(year from v_today)::int, extract(month from v_today)::int, v_company.payroll_start_day)
    else (make_date(extract(year from v_today)::int, extract(month from v_today)::int, v_company.payroll_start_day) - interval '1 month')::date
  end;
  v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;

  return (
    with items as (
      select l.log_date as work_date, v.amount
      from public.project_stage_logs l
      join public.project_stage_progress sp on sp.id = l.progress_id
      join public.projects pr on pr.id = sp.project_id
      left join public.hakedis_log_values v on v.log_id = l.id
      where l.company_id = v_company.id and l.quantity is not null
        and public.can_access_branch(pr.branch_id)
        and (p_branch_id is null or pr.branch_id = p_branch_id)
        and l.log_date >= least(v_period_start, date_trunc('week', v_today)::date)
      union all
      select e.work_date, x.amount
      from public.production_items i
      join public.production_jobs j on j.id = i.production_job_id
      join public.production_entries e on e.id = j.production_entry_id
      left join public.projects pr on pr.id = j.project_id
      left join public.hakedis_extra_values x on x.production_item_id = i.id
      where i.company_id = v_company.id and i.kind = 'extra'
        and public.can_access_branch(coalesce(pr.branch_id, e.branch_id))
        and (p_branch_id is null or coalesce(pr.branch_id, e.branch_id) = p_branch_id)
        and e.work_date >= least(v_period_start, date_trunc('week', v_today)::date)
    )
    select jsonb_build_object(
      'currency_code', v_company.currency_code,
      'period_start', v_period_start,
      'period_end', v_period_end,
      'today', coalesce(sum(amount) filter (where work_date = v_today), 0),
      'week', coalesce(sum(amount) filter (where work_date >= date_trunc('week', v_today)::date and work_date <= v_today), 0),
      'period', coalesce(sum(amount) filter (where work_date between v_period_start and v_period_end), 0),
      'unpriced_in_period', count(*) filter (where amount is null and work_date between v_period_start and v_period_end)
    )
    from items
  );
end;
$function$;
revoke all on function public.get_hakedis_summary(uuid) from public, anon;
grant execute on function public.get_hakedis_summary(uuid) to authenticated;

-- Genel Bakış proje sayıları: şube süzgeci
drop function public.get_dashboard_stats();
CREATE FUNCTION public.get_dashboard_stats(p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'total', count(*) filter (where not is_archived and not is_cancelled),
    'waiting', count(*) filter (where not is_archived and not is_cancelled and status = 'waiting'),
    'in_progress', count(*) filter (where not is_archived and not is_cancelled and status = 'in_progress'),
    'on_hold', count(*) filter (where not is_archived and not is_cancelled and status = 'on_hold'),
    'delayed', count(*) filter (where not is_archived and not is_cancelled and status = 'delayed'),
    'completed', count(*) filter (where not is_cancelled and status = 'completed'),
    'archived', count(*) filter (where is_archived),
    'cancelled', count(*) filter (where is_cancelled)
  )
  from public.projects
  where p_branch_id is null or branch_id = p_branch_id;
$function$;
revoke all on function public.get_dashboard_stats(uuid) from public, anon;
grant execute on function public.get_dashboard_stats(uuid) to authenticated;

-- Genel Bakış özeti: şube süzgeci
drop function public.get_dashboard_overview();
CREATE FUNCTION public.get_dashboard_overview(p_branch_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'types', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id,
        'name', t.name,
        'color', t.color,
        'total', (select count(*) from public.projects p where (p_branch_id is null or p.branch_id = p_branch_id) and p.project_type_id = t.id and not p.is_archived and not p.is_cancelled),
        'waiting', (select count(*) from public.projects p where (p_branch_id is null or p.branch_id = p_branch_id) and p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status = 'waiting'),
        'in_progress', (select count(*) from public.projects p where (p_branch_id is null or p.branch_id = p_branch_id) and p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status = 'in_progress'),
        'on_hold', (select count(*) from public.projects p where (p_branch_id is null or p.branch_id = p_branch_id) and p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status = 'on_hold'),
        'delayed', (select count(*) from public.projects p where (p_branch_id is null or p.branch_id = p_branch_id) and p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status = 'delayed'),
        'completed', (select count(*) from public.projects p where (p_branch_id is null or p.branch_id = p_branch_id) and p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status = 'completed'),
        'avg_progress', (select coalesce(round(avg(p.progress_percent)), 0) from public.projects p where (p_branch_id is null or p.branch_id = p_branch_id) and p.project_type_id = t.id and not p.is_archived and not p.is_cancelled and p.status <> 'completed'),
        'stages', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', st.id,
            'name', st.name,
            'unit', st.unit,
            'done', (select count(*) from public.project_stage_progress sp join public.projects p on p.id = sp.project_id
                     where (p_branch_id is null or p.branch_id = p_branch_id) and sp.stage_id = st.id and sp.status = 'done' and not p.is_archived and not p.is_cancelled),
            'in_progress', (select count(*) from public.project_stage_progress sp join public.projects p on p.id = sp.project_id
                     where (p_branch_id is null or p.branch_id = p_branch_id) and sp.stage_id = st.id and sp.status = 'in_progress' and not p.is_archived and not p.is_cancelled),
            'not_started', (select count(*) from public.project_stage_progress sp join public.projects p on p.id = sp.project_id
                     where (p_branch_id is null or p.branch_id = p_branch_id) and sp.stage_id = st.id and sp.status = 'not_started' and not p.is_archived and not p.is_cancelled),
            'done_quantity', (select coalesce(sum(sp.done_quantity), 0) from public.project_stage_progress sp join public.projects p on p.id = sp.project_id
                     where (p_branch_id is null or p.branch_id = p_branch_id) and sp.stage_id = st.id and not p.is_archived and not p.is_cancelled)
          ) order by st.sort_order)
          from public.project_type_stages st where st.project_type_id = t.id
        ), '[]'::jsonb)
      ) order by t.sort_order, t.name)
      from public.project_types t
      where not t.is_archived
    ), '[]'::jsonb),
    'upcoming', coalesce((
      select jsonb_agg(row_to_json(u)::jsonb order by u.estimated_end_date)
      from (
        select p.id, p.project_code, p.name, p.status, p.progress_percent, p.estimated_end_date
        from public.projects p
        where (p_branch_id is null or p.branch_id = p_branch_id) and not p.is_archived and not p.is_cancelled and p.status <> 'completed'
          and p.estimated_end_date is not null and p.estimated_end_date <= current_date + 14
        order by p.estimated_end_date
        limit 8
      ) u
    ), '[]'::jsonb),
    'recent_logs', coalesce((
      select jsonb_agg(row_to_json(r)::jsonb order by r.log_date desc, r.created_at desc)
      from (
        select l.id, l.log_date, l.quantity, l.team_leader_name, l.notes, l.created_at,
               st.name as stage_name, st.unit, p.id as project_id, p.project_code, p.name as project_name,
               s.name as section_name
        from public.project_stage_logs l
        join public.project_stage_progress sp on sp.id = l.progress_id
        join public.project_type_stages st on st.id = sp.stage_id
        join public.projects p on p.id = sp.project_id
        left join public.project_sections s on s.id = sp.section_id
        where (p_branch_id is null or p.branch_id = p_branch_id)
        order by l.log_date desc, l.created_at desc
        limit 10
      ) r
    ), '[]'::jsonb)
  );
$function$;
revoke all on function public.get_dashboard_overview(uuid) from public, anon;
grant execute on function public.get_dashboard_overview(uuid) to authenticated;

-- Bildirimler: yalnızca erişilebilen şubeler; puantaj onayı şube bazında
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
        from public.personnel where company_id = v_company and approval_status = 'pending' and public.can_access_branch(branch_id)
        union all
        select 'vehicle', count(*), max(created_at)
        from public.vehicles where company_id = v_company and approval_status = 'pending' and public.can_access_branch(branch_id)
      ) x
      where v_users and x.n > 0

      union all
      -- Geçen ayın puantajı onaylanmadı
      select 'attendance_month:' || to_char(m.month_start, 'YYYY-MM') || ':' || b.id, 'attendance_approval', 'Puantaj onayı bekliyor',
             b.name || ' · ' || to_char(m.month_start, 'MM.YYYY') || ' puantajı henüz onaylanmadı. Onaylanınca ay kesinleşir.',
             '/panel/attendance?year=' || extract(year from m.month_start)::integer || '&month=' || extract(month from m.month_start)::integer,
             (m.month_start + interval '1 month')::timestamptz
      from (select (date_trunc('month', v_today) - interval '1 month')::date as month_start) m
      cross join public.branches b
      where v_users
        and b.company_id = v_company
        and public.can_access_branch(b.id)
        and exists (
          select 1 from public.attendance_records a
          join public.personnel p on p.id = a.personnel_id
          where a.company_id = v_company and p.branch_id = b.id
            and a.attendance_date >= m.month_start and a.attendance_date < m.month_start + interval '1 month')
        and not public.attendance_month_is_locked(v_company, b.id, m.month_start)

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
      where v_projects and p.company_id = v_company and public.can_access_branch(p.branch_id) and not p.is_cancelled and not p.is_archived
        and p.status <> 'completed'
        and (p.status = 'delayed' or p.estimated_end_date < v_today)

      union all
      -- Bitişi 3 gün içinde olan proje
      select 'project_due:' || p.id || ':' || p.estimated_end_date, 'project_due', 'Proje bitişi yaklaşıyor',
             concat_ws(' · ', p.name, p.project_code) || ' — planlanan bitiş ' || to_char(p.estimated_end_date, 'DD.MM.YYYY'),
             '/panel/projects/' || p.id, (p.estimated_end_date - 3)::timestamptz
      from public.projects p
      where v_projects and p.company_id = v_company and public.can_access_branch(p.branch_id) and not p.is_cancelled and not p.is_archived
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
      where v_vehicles and v.company_id = v_company and public.can_access_branch(v.branch_id) and d.due is not null and d.due <= v_today + 15

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
           join public.project_stage_progress sp on sp.id = l.progress_id
           join public.projects pr on pr.id = sp.project_id
           where l.company_id = v_company and l.quantity is not null and hv.log_id is null
             and public.can_access_branch(pr.branch_id)
             and l.log_date >= v_today - 31)
          +
          (select count(*) from public.production_items i
           join public.production_jobs j on j.id = i.production_job_id
           join public.production_entries e on e.id = j.production_entry_id
           left join public.hakedis_extra_values x on x.production_item_id = i.id
           where i.company_id = v_company and i.kind = 'extra' and x.production_item_id is null
             and public.can_access_branch(e.branch_id)
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

-- Taşeron listesi: erişilebilen şubeler
CREATE OR REPLACE FUNCTION public.list_subcontractors()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_company uuid := public.current_company_id();
  v_money boolean := public.has_module_write_permission('hakedis');
begin
  if v_company is null or not (public.can_review_records() or v_money) then
    raise exception 'Taşeronlar için yetki gerekli' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'personnel_id', s.personnel_id, 'contact_name', s.contact_name, 'phone', s.phone,
      'tax_number', s.tax_number, 'iban', s.iban, 'share_percent', s.share_percent,
      'is_active', s.is_active, 'notes', s.notes, 'created_at', s.created_at,
      'team_count', (select count(*) from public.teams t where t.subcontractor_id = s.id and t.is_active),
      'personnel_count', (select count(*) from public.personnel p where p.subcontractor_id = s.id and p.is_active),
      'balance', case when v_money then
        (select coalesce(sum(share_amount), 0) from public.subcontractor_work_rows(v_company, s.id, null, null))
        - (select coalesce(sum(amount), 0) from public.subcontractor_salary_rows(v_company, s.id, null, null))
        - (select coalesce(sum(amount), 0) from public.subcontractor_transactions x where x.subcontractor_id = s.id)
      end
    ) order by s.is_active desc, s.name)
    from public.subcontractors s
    where s.company_id = v_company
      and (s.personnel_id is null or exists (
        select 1 from public.personnel p where p.id = s.personnel_id and public.can_access_branch(p.branch_id)))
  ), '[]'::jsonb);
end;
$function$;

-- Taşeron ekstresi: erişilebilen şubeler
CREATE OR REPLACE FUNCTION public.get_subcontractor_statement(p_subcontractor_id uuid, p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_company uuid := public.current_company_id();
  v_sub public.subcontractors;
  v_before_share numeric;
  v_before_salary numeric;
  v_before_paid numeric;
begin
  if v_company is null or not public.has_module_write_permission('hakedis') then
    raise exception 'Taşeron hakedişi için hakediş yetkisi gerekli' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Geçersiz tarih aralığı';
  end if;
  select * into v_sub from public.subcontractors where id = p_subcontractor_id and company_id = v_company;
  if not found or (v_sub.personnel_id is not null and not exists (
    select 1 from public.personnel p where p.id = v_sub.personnel_id and public.can_access_branch(p.branch_id))) then
    raise exception 'Taşeron bulunamadı';
  end if;

  select coalesce(sum(share_amount), 0) into v_before_share
  from public.subcontractor_work_rows(v_company, v_sub.id, null, p_start - 1);
  select coalesce(sum(amount), 0) into v_before_salary
  from public.subcontractor_salary_rows(v_company, v_sub.id, null, p_start - 1);
  select coalesce(sum(amount), 0) into v_before_paid
  from public.subcontractor_transactions
  where subcontractor_id = v_sub.id and transaction_date < p_start;

  return (
    with work as (
      select * from public.subcontractor_work_rows(v_company, v_sub.id, p_start, p_end)
    ),
    salaries as (
      select * from public.subcontractor_salary_rows(v_company, v_sub.id, p_start, p_end)
    ),
    tx as (
      select t.id, t.transaction_date, t.amount, t.notes, c.id as category_id, c.name as category_name
      from public.subcontractor_transactions t
      join public.subcontractor_expense_categories c on c.id = t.category_id
      where t.subcontractor_id = v_sub.id and t.transaction_date between p_start and p_end
    )
    select jsonb_build_object(
      'subcontractor_id', v_sub.id,
      'start', p_start,
      'end', p_end,
      'employer_total', coalesce((select sum(amount) from work), 0),
      'share_total', coalesce((select sum(share_amount) from work), 0),
      'company_total', coalesce((select sum(amount - share_amount) from work), 0),
      'unpriced_count', (select count(*) from work where amount is null),
      'salary_total', coalesce((select sum(amount) from salaries), 0),
      'paid_total', coalesce((select sum(amount) from tx), 0),
      'carried_balance', v_before_share - v_before_salary - v_before_paid,
      'balance', v_before_share - v_before_salary - v_before_paid
        + coalesce((select sum(share_amount) from work), 0)
        - coalesce((select sum(amount) from salaries), 0)
        - coalesce((select sum(amount) from tx), 0),
      'rows', coalesce((
        select jsonb_agg(to_jsonb(w) order by w.work_date, w.project_code, w.item_name) from work w
      ), '[]'::jsonb),
      'salaries', coalesce((
        select jsonb_agg(to_jsonb(s) order by s.full_name) from salaries s
      ), '[]'::jsonb),
      'transactions', coalesce((
        select jsonb_agg(to_jsonb(t) order by t.transaction_date, t.category_name) from tx t
      ), '[]'::jsonb),
      'by_category', coalesce((
        select jsonb_agg(x order by x.amount desc) from (
          select category_name, sum(amount) as amount from tx group by category_name
        ) x
      ), '[]'::jsonb)
    )
  );
end;
$function$;

-- Stok hareketi: yalnızca erişilebilen depo
CREATE OR REPLACE FUNCTION public.record_inventory_movement(p_material_id uuid, p_movement_type inventory_movement_type, p_quantity numeric, p_location_id uuid DEFAULT NULL::uuid, p_project_name text DEFAULT NULL::text, p_project_code text DEFAULT NULL::text, p_team_personnel_ids uuid[] DEFAULT '{}'::uuid[], p_description text DEFAULT NULL::text)
 RETURNS inventory_materials
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_material public.inventory_materials;
  v_location uuid;
  v_balance numeric(14,3);
  v_names text[];
begin
  if not public.has_module_write_permission('inventory') then
    raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_movement_type = 'out' and char_length(trim(coalesce(p_project_name, ''))) < 2 then
    raise exception 'Proje adı zorunlu';
  end if;
  select * into v_material from public.inventory_materials where company_id = public.current_company_id() and id = p_material_id;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;

  v_location := public.inventory_resolve_location(p_location_id);
  perform public.inventory_require_branch_access(v_location);
  v_balance := public.inventory_adjust_stock(p_material_id, v_location,
    case when p_movement_type = 'in' then p_quantity else -p_quantity end);

  select coalesce(array_agg(full_name order by full_name), '{}') into v_names
  from public.personnel where company_id = public.current_company_id() and id = any(coalesce(p_team_personnel_ids, '{}'));

  insert into public.inventory_movements
    (material_id, movement_type, quantity, usage_location, description, balance_after, created_by,
     action_type, source_location_id, target_location_id, project_name, project_code, team_personnel_ids, team_personnel_names)
  values
    (p_material_id, p_movement_type, p_quantity,
     case when p_movement_type = 'out' then trim(p_project_name) end,
     nullif(trim(p_description), ''), v_balance, auth.uid(),
     case when p_movement_type = 'in' then 'in' else 'usage' end,
     case when p_movement_type = 'out' then v_location end,
     case when p_movement_type = 'in' then v_location end,
     case when p_movement_type = 'out' then trim(p_project_name) end,
     case when p_movement_type = 'out' then nullif(trim(p_project_code), '') end,
     coalesce(p_team_personnel_ids, '{}'), v_names);

  select * into v_material from public.inventory_materials where id = p_material_id;
  return v_material;
end;
$function$;

-- Depolar arası sevkiyat: çıkış deposu erişilebilir olmalı (varış serbest)
CREATE OR REPLACE FUNCTION public.create_inventory_transfer(p_shipment_date date, p_from_location_id uuid, p_to_location_id uuid, p_delivered_by text, p_received_by text, p_vehicle_plate text, p_notes text, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_shipment_id uuid; v_item jsonb; v_material public.inventory_materials; v_material_id uuid; v_quantity numeric;
  v_from uuid; v_to uuid; v_balance numeric;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_shipment_date is null then raise exception 'Sevkiyat tarihi zorunlu'; end if;
  if p_from_location_id is null or p_to_location_id is null then raise exception 'Çıkış ve varış deposu zorunlu'; end if;
  v_from := public.inventory_resolve_location(p_from_location_id);
  perform public.inventory_require_branch_access(v_from);
  v_to := public.inventory_resolve_location(p_to_location_id);
  if v_from = v_to then raise exception 'Çıkış ve varış deposu aynı olamaz'; end if;
  if char_length(trim(coalesce(p_delivered_by,'')))<2 then raise exception 'Teslim eden zorunlu'; end if;
  if char_length(trim(coalesce(p_received_by,'')))<2 then raise exception 'Teslim alan zorunlu'; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
  if (select count(*) from jsonb_array_elements(p_items))<>(select count(distinct value->>'material_id') from jsonb_array_elements(p_items)) then
    raise exception 'Aynı malzeme sevkiyat listesine iki kez eklenemez';
  end if;

  insert into public.inventory_shipments(shipment_date,delivered_by,received_by,vehicle_id,vehicle_plate,notes,created_by,from_location_id,to_location_id)
  values(p_shipment_date,trim(p_delivered_by),trim(p_received_by),null,nullif(upper(trim(coalesce(p_vehicle_plate,''))),''),
    nullif(trim(p_notes),''),auth.uid(),v_from,v_to)
  returning id into v_shipment_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_material_id := (v_item->>'material_id')::uuid; v_quantity := (v_item->>'quantity')::numeric;
    if v_quantity is null or v_quantity<=0 then raise exception 'Sevk miktarı sıfırdan büyük olmalıdır'; end if;
    select * into v_material from public.inventory_materials
    where company_id=public.current_company_id() and id=v_material_id and material_category='stock';
    if not found then raise exception 'Sevk edilecek malzeme bulunamadı'; end if;
    if v_material.unit='piece' and v_quantity<>trunc(v_quantity) then raise exception '% için adet miktarı tam sayı olmalıdır',v_material.material_name; end if;
    v_balance := public.inventory_adjust_stock(v_material_id, v_from, -v_quantity);
    perform public.inventory_adjust_stock(v_material_id, v_to, v_quantity);
    insert into public.inventory_shipment_items(shipment_id,material_id,quantity) values(v_shipment_id,v_material_id,v_quantity);
    insert into public.inventory_movements(material_id,movement_type,quantity,usage_location,description,balance_after,created_by,action_type,source_location_id,target_location_id,shipment_id)
    values(v_material_id,'out',v_quantity,public.inventory_location_name(v_to),nullif(trim(p_notes),''),v_balance,auth.uid(),'transfer',v_from,v_to,v_shipment_id);
  end loop;
  return v_shipment_id;
end;
$function$;

-- İrsaliye girişi: yalnızca erişilebilen depo
CREATE OR REPLACE FUNCTION public.create_inventory_receipt(p_receipt_date date, p_received_by text, p_dispatch_number text, p_notes text, p_items jsonb, p_location_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
AS $function$
declare
  v_id uuid; v_item jsonb; v_catalog public.inventory_catalog; v_material public.inventory_materials;
  v_qty numeric; v_code text; v_location uuid; v_balance numeric;
begin
  if not (public.has_module_write_permission('inventory') or public.current_user_role() = 'accounting') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if p_receipt_date is null or char_length(trim(coalesce(p_received_by,'')))<2 or char_length(trim(coalesce(p_dispatch_number,'')))<1 then
    raise exception 'Tarih, teslim alan ve irsaliye numarası zorunlu';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'En az bir malzeme eklenmelidir'; end if;
  v_location := public.inventory_resolve_location(p_location_id);
  perform public.inventory_require_branch_access(v_location);
  insert into public.inventory_receipts(receipt_date,received_by,dispatch_number,notes,created_by)
  values(p_receipt_date,trim(p_received_by),trim(p_dispatch_number),nullif(trim(p_notes),''),auth.uid()) returning id into v_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_catalog from public.inventory_catalog where company_id=public.current_company_id() and id=(v_item->>'catalog_id')::uuid;
    if not found then raise exception 'Katalog malzemesi bulunamadı'; end if;
    v_qty:=(v_item->>'quantity')::numeric; v_code:=nullif(trim(v_item->>'material_code'),'');
    if v_qty is null or v_qty<=0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
    if v_catalog.unit='piece' and v_qty<>trunc(v_qty) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
    if v_catalog.has_id and v_code is null then raise exception '% için malzeme ID zorunlu',v_catalog.material_name; end if;
    if not v_catalog.has_id then v_code:=null; end if;
    if v_code is not null and exists(select 1 from public.inventory_materials where company_id=public.current_company_id() and lower(trim(material_code))=lower(v_code)) then
      raise exception 'Bu malzeme ID daha önce kullanılmış: %',v_code;
    end if;
    select * into v_material from public.inventory_materials
    where company_id=public.current_company_id() and catalog_id=v_catalog.id and unit=v_catalog.unit and coalesce(material_code,'')=coalesce(v_code,'') for update;
    if not found then
      insert into public.inventory_materials(catalog_id,material_code,material_name,category_id,material_type,size,unit,stock_quantity,notes,created_by,updated_by)
      values(v_catalog.id,v_code,v_catalog.material_name,v_catalog.category_id,v_catalog.material_type,v_catalog.size,v_catalog.unit,0,v_catalog.notes,auth.uid(),auth.uid())
      returning * into v_material;
    end if;
    v_balance := public.inventory_adjust_stock(v_material.id, v_location, v_qty);
    insert into public.inventory_receipt_items(receipt_id,material_id,quantity) values(v_id,v_material.id,v_qty);
    insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location_id,receipt_date,received_by,dispatch_number,receipt_id)
    values(v_material.id,'in',v_qty,'İrsaliye ile stok girişi',v_balance,auth.uid(),'in',v_location,p_receipt_date,trim(p_received_by),trim(p_dispatch_number),v_id);
  end loop;
  return v_id;
end $function$;

-- Eski (şubesiz) kilit fonksiyonu artık kullanılmıyor.
drop function public.attendance_month_is_locked(uuid, date);
