-- Şubeler (D1)
--
--   1. Her firmada otomatik "Merkez" şubesi; mevcut bütün kayıtlar Merkez'e bağlanır.
--   2. Proje, personel, araç ve depo tek bir şubeye bağlıdır (personelin şubesi kartından değişir).
--   3. Firma yöneticisi bütün şubeleri görür; şantiye şefi ve muhasebe yalnızca atandıkları şubeleri.
--      Kısıt veritabanındadır: doğrudan okuma/yazma RLS ile, fonksiyon içi yazmalar koruma tetikleyicisiyle.
--   4. Şube açma ve kullanıcıya şube atama yalnızca firma yöneticisi.
--   Proje türleri ve birim fiyatlar firma genelinde ortak kalır.
--   İş planı, imalat, puantaj onayı, raporlar ve stok listelerinin şubeye göre ayrılması D2'dedir.

-- 1. Şubeler ---------------------------------------------------------------------------------

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 80),
  is_main boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint branches_company_id_id_key unique (company_id, id)
);
create unique index branches_company_name on public.branches (company_id, lower(trim(name)));
create unique index branches_one_main on public.branches (company_id) where is_main;

comment on table public.branches is 'Firma şubeleri; is_main = Merkez (silinemez)';

create table public.user_branches (
  user_id uuid not null,
  branch_id uuid not null,
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, branch_id),
  constraint user_branches_user_fkey foreign key (user_id)
    references public.profiles (id) on delete cascade,
  constraint user_branches_branch_fkey foreign key (company_id, branch_id)
    references public.branches (company_id, id) on delete cascade
);

comment on table public.user_branches is 'Şantiye şefi ve muhasebenin erişebildiği şubeler (firma yöneticisi bütün şubeleri görür)';

-- Kullanıcının firması değişirse (ret, firma silme) şube atamaları silinir.
create function public.profiles_clear_user_branches()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.company_id is distinct from old.company_id then
    delete from public.user_branches where user_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.profiles_clear_user_branches() from public, anon, authenticated;

create trigger a0_clear_user_branches
before update of company_id on public.profiles
for each row execute function public.profiles_clear_user_branches();

-- Merkez şubesi: yeni firmada otomatik, mevcut firmalara bir kez.
create function public.company_main_branch(p_company_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.branches where company_id = p_company_id and is_main;
  if v_id is null then
    insert into public.branches (company_id, name, is_main, sort_order)
    values (p_company_id, 'Merkez', true, 0)
    on conflict do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.branches where company_id = p_company_id and is_main;
    end if;
  end if;
  return v_id;
end;
$$;

create function public.companies_create_main_branch()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.company_main_branch(new.id);
  return null;
end;
$$;

-- Ana depo tetikleyicisinden (companies_create_main_location) önce çalışır (ad sırası).
create trigger companies_create_main_branch
after insert on public.companies
for each row execute function public.companies_create_main_branch();

select public.company_main_branch(id) from public.companies;

-- 2. Erişim yardımcıları -------------------------------------------------------------------------

create function public.can_access_branch(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when p_branch_id is null then false
    when public.current_user_role() = 'site_chief' then
      exists (select 1 from public.branches b where b.id = p_branch_id and b.company_id = public.current_company_id())
    when public.current_user_role() in ('company_manager', 'accounting') then
      exists (select 1 from public.user_branches ub where ub.user_id = auth.uid() and ub.branch_id = p_branch_id)
    else false
  end;
$$;

comment on function public.can_access_branch(uuid) is
  'Firma yöneticisi bütün şubelere, şantiye şefi ve muhasebe atandıkları şubelere erişir';

-- Yeni kayıtta şube verilmezse: firma yöneticisi/sistem için Merkez, diğerleri için erişebildiği ilk şube.
create function public.default_branch_for(p_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    case when public.is_tenant_request() and public.current_user_role() in ('company_manager', 'accounting') then (
      select b.id from public.user_branches ub join public.branches b on b.id = ub.branch_id
      where ub.user_id = auth.uid() and b.company_id = p_company_id
      order by b.is_main desc, b.sort_order, b.name limit 1
    ) end,
    (select id from public.branches where company_id = p_company_id and is_main)
  );
$$;

revoke all on function public.company_main_branch(uuid) from public, anon, authenticated;
revoke all on function public.companies_create_main_branch() from public, anon, authenticated;
revoke all on function public.default_branch_for(uuid) from public, anon, authenticated;
revoke all on function public.can_access_branch(uuid) from public, anon;
grant execute on function public.can_access_branch(uuid) to authenticated;

-- 3. Kayıtların şubesi -----------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array['projects', 'personnel', 'vehicles', 'inventory_locations'] loop
    execute format('alter table public.%I add column branch_id uuid', v_table);
    execute format('alter table public.%I disable trigger user', v_table);
    execute format('update public.%I t set branch_id = public.company_main_branch(t.company_id)', v_table);
    execute format('alter table public.%I enable trigger user', v_table);
    execute format('alter table public.%I alter column branch_id set not null', v_table);
    execute format('alter table public.%I add constraint %I foreign key (company_id, branch_id)
      references public.branches (company_id, id)', v_table, v_table || '_branch_fkey');
    execute format('create index %I on public.%I (branch_id)', 'idx_' || v_table || '_branch', v_table);
  end loop;
end $$;

create function public.set_default_branch()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.branch_id is null then
    new.branch_id := public.default_branch_for(new.company_id);
  end if;
  return new;
end;
$$;

revoke all on function public.set_default_branch() from public, anon, authenticated;

-- a0_enforce_company_scope'tan sonra (company_id dolduktan sonra) çalışır.
create trigger a0_set_default_branch before insert on public.projects
for each row execute function public.set_default_branch();
create trigger a0_set_default_branch before insert on public.personnel
for each row execute function public.set_default_branch();
create trigger a0_set_default_branch before insert on public.vehicles
for each row execute function public.set_default_branch();
create trigger a0_set_default_branch before insert on public.inventory_locations
for each row execute function public.set_default_branch();

-- 4. Kullanıcıların şubeleri ------------------------------------------------------------------------

-- Mevcut şantiye şefi ve muhasebe kullanıcıları bütün şubelere (şu an yalnızca Merkez) bağlanır.
insert into public.user_branches (user_id, branch_id, company_id)
select p.id, b.id, p.company_id
from public.profiles p
join public.branches b on b.company_id = p.company_id
where p.is_approved and p.role in ('company_manager', 'accounting')
on conflict do nothing;

-- Rol atanınca varsayılan yetkiler ve şubeler. Şube: atayan şefse kendi şubeleri, yoksa Merkez.
create or replace function public.reset_role_permissions(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := (select company_id from public.profiles where id = p_user_id);
begin
  delete from public.company_manager_permissions where user_id = p_user_id;

  if p_role = 'company_manager' then
    insert into public.company_manager_permissions (
      user_id, projects_write, work_plans_write, personnel_write, attendance_write,
      vehicles_write, inventory_write, custody_write, productions_write, hakedis_write, updated_by
    ) values (p_user_id, true, true, true, true, true, true, true, true, false, auth.uid());
  elsif p_role = 'accounting' then
    insert into public.company_manager_permissions (user_id, hakedis_write, updated_by)
    values (p_user_id, true, auth.uid());
  end if;

  if p_role not in ('company_manager', 'accounting') then
    delete from public.user_branches where user_id = p_user_id;
  elsif not exists (select 1 from public.user_branches where user_id = p_user_id) then
    if public.current_user_role() = 'company_manager' then
      insert into public.user_branches (user_id, branch_id, company_id)
      select p_user_id, ub.branch_id, v_company from public.user_branches ub where ub.user_id = auth.uid();
    else
      insert into public.user_branches (user_id, branch_id, company_id)
      values (p_user_id, public.company_main_branch(v_company), v_company);
    end if;
  end if;
end;
$$;

-- Firma yöneticisi bir şef/muhasebe kullanıcısının şubelerini belirler (en az bir şube).
create function public.set_user_branches(p_user_id uuid, p_branch_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
  v_role text;
begin
  if not public.is_site_chief() or v_company is null then
    raise exception 'Şube atamasını yalnızca firma yöneticisi yapabilir' using errcode = '42501';
  end if;
  select role into v_role from public.profiles where id = p_user_id and company_id = v_company and is_approved;
  if v_role is null or v_role not in ('company_manager', 'accounting') then
    raise exception 'Şube yalnızca şantiye şefi veya muhasebe kullanıcısına atanır';
  end if;
  if p_branch_ids is null or cardinality(p_branch_ids) = 0 then
    raise exception 'En az bir şube seçilmelidir';
  end if;
  if exists (select 1 from unnest(p_branch_ids) x(id)
             where not exists (select 1 from public.branches b where b.id = x.id and b.company_id = v_company)) then
    raise exception 'Şube bulunamadı';
  end if;

  delete from public.user_branches where user_id = p_user_id and branch_id <> all (p_branch_ids);
  insert into public.user_branches (user_id, branch_id, company_id)
  select p_user_id, x.id, v_company from unnest(p_branch_ids) x(id)
  on conflict do nothing;
end;
$$;

-- Görünür şubeler: firma yöneticisine hepsi, diğerlerine atandıkları; kullanıcı atamaları yöneticiye.
create function public.get_my_branches()
returns jsonb
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select jsonb_build_object(
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'is_main', b.is_main, 'sort_order', b.sort_order)
                       order by b.is_main desc, b.sort_order, b.name)
      from public.branches b
      where b.company_id = public.current_company_id() and public.can_access_branch(b.id)
    ), '[]'::jsonb),
    'total_count', (select count(*) from public.branches b where b.company_id = public.current_company_id()),
    'assignments', case when public.is_site_chief() then coalesce((
      select jsonb_agg(jsonb_build_object('user_id', ub.user_id, 'branch_id', ub.branch_id))
      from public.user_branches ub where ub.company_id = public.current_company_id()
    ), '[]'::jsonb) end
  );
$$;

revoke all on function public.set_user_branches(uuid, uuid[]) from public, anon;
revoke all on function public.get_my_branches() from public, anon;
grant execute on function public.set_user_branches(uuid, uuid[]) to authenticated;
grant execute on function public.get_my_branches() to authenticated;

-- 5. Şube tablosu erişimi -----------------------------------------------------------------------------

alter table public.branches enable row level security;
alter table public.user_branches enable row level security;
revoke all on public.branches, public.user_branches from anon;
grant select, insert, update, delete on public.branches to authenticated;
revoke all on public.user_branches from authenticated;

create policy company_isolation on public.branches as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy branches_select on public.branches for select to authenticated
  using (public.is_site_chief() or public.can_access_branch(id));
create policy branches_write on public.branches for insert to authenticated
  with check (public.is_site_chief() and not is_main);
create policy branches_update on public.branches for update to authenticated
  using (public.is_site_chief()) with check (public.is_site_chief());
-- Merkez silinemez; kaydı olan şube de silinemez (yabancı anahtar).
create policy branches_delete on public.branches for delete to authenticated
  using (public.is_site_chief() and not is_main);

create trigger zz_audit_row_change after insert or update or delete on public.branches
for each row execute function public.audit_row_change('settings');

-- 6. Şube kısıtı (RLS) --------------------------------------------------------------------------------

-- Kendi şubesi olan tablolar. Depo adları herkese görünür (başka şubeye sevkiyat için); depoya yazma
-- koruma tetikleyicisiyle şubeyle sınırlı. Stok miktarlarının şubeye göre ayrılması D2'dedir.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['projects', 'personnel', 'vehicles'] loop
    execute format($p$create policy branch_isolation on public.%I as restrictive for all to authenticated
      using (public.can_access_branch(branch_id))
      with check (public.can_access_branch(branch_id))$p$, v_table);
  end loop;
end $$;

-- Alt kayıtlar: üst kaydı görebilen görür (üst kaydın şube kısıtı uygulanır).
create policy branch_isolation on public.attendance_records as restrictive for all to authenticated
  using (exists (select 1 from public.personnel p where p.id = personnel_id))
  with check (exists (select 1 from public.personnel p where p.id = personnel_id));
create policy branch_isolation on public.attendance_audit_logs as restrictive for all to authenticated
  using (exists (select 1 from public.personnel p where p.id = personnel_id));
create policy branch_isolation on public.personnel_advances as restrictive for all to authenticated
  using (exists (select 1 from public.personnel p where p.id = personnel_id))
  with check (exists (select 1 from public.personnel p where p.id = personnel_id));
create policy branch_isolation on public.personnel_employment_periods as restrictive for all to authenticated
  using (exists (select 1 from public.personnel p where p.id = personnel_id))
  with check (exists (select 1 from public.personnel p where p.id = personnel_id));
create policy branch_isolation on public.vehicle_fuel_logs as restrictive for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id));
create policy branch_isolation on public.project_sections as restrictive for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id))
  with check (exists (select 1 from public.projects p where p.id = project_id));
create policy branch_isolation on public.project_stage_progress as restrictive for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id))
  with check (exists (select 1 from public.projects p where p.id = project_id));
create policy branch_isolation on public.project_stage_logs as restrictive for all to authenticated
  using (exists (select 1 from public.project_stage_progress sp where sp.id = progress_id))
  with check (exists (select 1 from public.project_stage_progress sp where sp.id = progress_id));
create policy branch_isolation on public.project_cancellation_history as restrictive for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));
create policy branch_isolation on public.hakedis_project_prices as restrictive for all to authenticated
  using (exists (select 1 from public.project_stage_progress sp where sp.id = progress_id))
  with check (exists (select 1 from public.project_stage_progress sp where sp.id = progress_id));
create policy branch_isolation on public.hakedis_log_values as restrictive for all to authenticated
  using (exists (select 1 from public.project_stage_logs l where l.id = log_id))
  with check (exists (select 1 from public.project_stage_logs l where l.id = log_id));
create policy branch_isolation on public.production_entries as restrictive for all to authenticated
  using (exists (select 1 from public.personnel p where p.id = team_leader_personnel_id));
create policy branch_isolation on public.production_jobs as restrictive for all to authenticated
  using (exists (select 1 from public.production_entries e where e.id = production_entry_id));
create policy branch_isolation on public.production_items as restrictive for all to authenticated
  using (exists (select 1 from public.production_jobs j where j.id = production_job_id));
create policy branch_isolation on public.hakedis_extra_values as restrictive for all to authenticated
  using (exists (select 1 from public.production_items i where i.id = production_item_id));
create policy branch_isolation on public.subcontractors as restrictive for all to authenticated
  using (personnel_id is null or exists (select 1 from public.personnel p where p.id = personnel_id))
  with check (personnel_id is null or exists (select 1 from public.personnel p where p.id = personnel_id));
create policy branch_isolation on public.subcontractor_transactions as restrictive for all to authenticated
  using (exists (select 1 from public.subcontractors s where s.id = subcontractor_id))
  with check (exists (select 1 from public.subcontractors s where s.id = subcontractor_id));

-- 7. Fonksiyon içi yazmalar: şube koruma tetikleyicisi ------------------------------------------------
-- RLS'i kapatan (SECURITY DEFINER) fonksiyonlar da başka şubenin kaydına yazamaz.
-- Argüman: 'self' (satırın kendi şubesi) veya üst kaydın kolonu ve türü: 'personnel:personnel_id' gibi.
create function public.guard_branch_write()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_spec text := tg_argv[0];
  v_kind text := split_part(v_spec, ':', 1);
  v_column text := split_part(v_spec, ':', 2);
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb;
  v_branch uuid;
begin
  if not public.is_tenant_request() or pg_trigger_depth() > 1
    or current_setting('mk_ops.allow_company_reset', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  foreach v_row in array array[v_old, v_new] loop
    continue when v_row is null;
    v_branch := case v_kind
      when 'self' then (v_row ->> 'branch_id')::uuid
      when 'personnel' then (select p.branch_id from public.personnel p where p.id = (v_row ->> v_column)::uuid)
      when 'vehicle' then (select v.branch_id from public.vehicles v where v.id = (v_row ->> v_column)::uuid)
      when 'progress' then (select p.branch_id from public.project_stage_progress sp
                            join public.projects p on p.id = sp.project_id where sp.id = (v_row ->> v_column)::uuid)
    end;
    if v_branch is not null and not public.can_access_branch(v_branch) then
      raise exception 'Bu kayıt erişiminiz olmayan bir şubeye ait' using errcode = '42501';
    end if;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.guard_branch_write() from public, anon, authenticated;

create trigger a1_guard_branch_write before insert or update or delete on public.projects
for each row execute function public.guard_branch_write('self');
create trigger a1_guard_branch_write before insert or update or delete on public.personnel
for each row execute function public.guard_branch_write('self');
create trigger a1_guard_branch_write before insert or update or delete on public.vehicles
for each row execute function public.guard_branch_write('self');
create trigger a1_guard_branch_write before insert or update or delete on public.inventory_locations
for each row execute function public.guard_branch_write('self');
create trigger a1_guard_branch_write before insert or update or delete on public.attendance_records
for each row execute function public.guard_branch_write('personnel:personnel_id');
create trigger a1_guard_branch_write before insert or update or delete on public.personnel_advances
for each row execute function public.guard_branch_write('personnel:personnel_id');
create trigger a1_guard_branch_write before insert or update or delete on public.vehicle_fuel_logs
for each row execute function public.guard_branch_write('vehicle:vehicle_id');
create trigger a1_guard_branch_write before insert or update or delete on public.production_entries
for each row execute function public.guard_branch_write('personnel:team_leader_personnel_id');
create trigger a1_guard_branch_write before insert or update or delete on public.project_stage_logs
for each row execute function public.guard_branch_write('progress:progress_id');

-- 8. Pazar hafta tatili: kullanıcı yalnızca erişebildiği şubelerin personeline ekler -----------------

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
    and not public.attendance_month_is_locked(p.company_id, d.attendance_date)
    and coalesce(p.employment_start_date,(p.created_at at time zone 'Europe/Istanbul')::date)<=d.attendance_date
    and (p.employment_end_date is null or p.employment_end_date>=d.attendance_date)
  on conflict(personnel_id,attendance_date) do nothing;
  get diagnostics v_inserted=row_count;
  return v_inserted;
end;
$function$;
