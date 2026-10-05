-- Muhasebe: Personel/Puantaj salt okunur; yazma yetkisini yalnız şantiye şefi verir.
insert into public.company_manager_permissions(user_id)
select id from public.profiles where role='accounting' and is_approved=true
on conflict(user_id) do nothing;

create or replace function public.has_module_write_permission(p_module text)
returns boolean language sql stable security definer set search_path=public set row_security=off as $$
  select case
    when public.current_user_role()='site_chief' then true
    when public.current_user_role() not in ('company_manager','accounting') then false
    else coalesce((select case p_module
      when 'projects' then cmp.projects_write when 'work_plans' then cmp.work_plans_write
      when 'personnel' then cmp.personnel_write when 'attendance' then cmp.attendance_write
      when 'vehicles' then cmp.vehicles_write when 'inventory' then cmp.inventory_write
      when 'custody' then cmp.custody_write when 'productions' then cmp.productions_write
      else false end from public.company_manager_permissions cmp where cmp.user_id=auth.uid()),false)
  end;
$$;

create or replace function public.set_company_manager_permission(p_user_id uuid,p_module text,p_enabled boolean)
returns public.company_manager_permissions language plpgsql security definer set search_path=public set row_security=off as $$
declare v_permissions public.company_manager_permissions; v_role text;
begin
  if not public.is_site_chief() then raise exception 'Bu işlem için şantiye şefi yetkisi gerekli' using errcode='42501'; end if;
  select role into v_role from public.profiles where id=p_user_id and is_approved=true;
  if v_role not in ('company_manager','accounting') then raise exception 'Kullanıcı yetkilendirilebilir bir rolde değil'; end if;
  if p_module not in ('projects','work_plans','personnel','attendance','vehicles','inventory','custody','productions') then raise exception 'Geçersiz yetki alanı'; end if;
  insert into public.company_manager_permissions(user_id,updated_by) values(p_user_id,auth.uid()) on conflict(user_id) do nothing;
  update public.company_manager_permissions set
    projects_write=case when p_module='projects' then p_enabled else projects_write end,
    work_plans_write=case when p_module='work_plans' then p_enabled else work_plans_write end,
    personnel_write=case when p_module='personnel' then p_enabled else personnel_write end,
    attendance_write=case when p_module='attendance' then p_enabled else attendance_write end,
    vehicles_write=case when p_module='vehicles' then p_enabled else vehicles_write end,
    inventory_write=case when p_module='inventory' then p_enabled else inventory_write end,
    custody_write=case when p_module='custody' then p_enabled else custody_write end,
    productions_write=case when p_module='productions' then p_enabled else productions_write end,
    updated_by=auth.uid()
  where user_id=p_user_id returning * into v_permissions;
  return v_permissions;
end; $$;

-- RLS yazma kuralları yetki fonksiyonunu kullanır.
drop policy if exists "personnel_insert_module_write" on public.personnel;
drop policy if exists "personnel_update_module_write" on public.personnel;
drop policy if exists "personnel_delete_module_write" on public.personnel;
drop policy if exists "personnel_insert_module_writer" on public.personnel;
drop policy if exists "personnel_update_module_writer" on public.personnel;
drop policy if exists "personnel_delete_module_writer" on public.personnel;
create policy "personnel_insert_module_write" on public.personnel for insert to authenticated with check(public.has_module_write_permission('personnel'));
create policy "personnel_update_module_write" on public.personnel for update to authenticated using(public.has_module_write_permission('personnel')) with check(public.has_module_write_permission('personnel'));
create policy "personnel_delete_module_write" on public.personnel for delete to authenticated using(public.has_module_write_permission('personnel'));

drop policy if exists "attendance_insert_module_write" on public.attendance_records;
drop policy if exists "attendance_update_module_write" on public.attendance_records;
drop policy if exists "attendance_delete_module_write" on public.attendance_records;
drop policy if exists "attendance_insert_module_writer" on public.attendance_records;
drop policy if exists "attendance_update_module_writer" on public.attendance_records;
drop policy if exists "attendance_delete_module_writer" on public.attendance_records;
create policy "attendance_insert_module_write" on public.attendance_records for insert to authenticated with check(public.has_module_write_permission('attendance'));
create policy "attendance_update_module_write" on public.attendance_records for update to authenticated using(public.has_module_write_permission('attendance')) with check(public.has_module_write_permission('attendance'));
create policy "attendance_delete_module_write" on public.attendance_records for delete to authenticated using(public.has_module_write_permission('attendance'));

drop policy if exists "attendance_audit_select_role_based" on public.attendance_audit_logs;
drop policy if exists "attendance_audit_select_personnel_roles" on public.attendance_audit_logs;
create policy "attendance_audit_select_personnel_roles" on public.attendance_audit_logs
for select to authenticated using(public.can_view_personnel_attendance());

-- Şantiye şefinin açtığı diğer modüller muhasebe menüsünde görüntülenebilir.
do $$ declare item record; begin
  for item in select * from (values
    ('projects','projects'),('app_settings','projects'),('project_sheets','projects'),('project_sheet_cables','projects'),('project_sheet_progress','projects'),('project_cabinets','projects'),('project_cabinet_progress','projects'),
    ('daily_work_plans','work_plans'),('daily_work_plan_teams','work_plans'),('daily_work_plan_team_members','work_plans'),('daily_work_plan_absences','work_plans'),
    ('vehicles','vehicles'),('vehicle_fuel_logs','vehicles'),
    ('inventory_materials','inventory'),('inventory_movements','inventory'),
    ('inventory_custody_balances','custody'),('inventory_custody_movements','custody'),
    ('production_item_definitions','productions'),('production_entries','productions'),('production_jobs','productions'),('production_items','productions')
  ) as allowed(table_name,module_name) loop
    if to_regclass('public.'||item.table_name) is not null then
      execute format('drop policy if exists %I on public.%I','accounting_granted_module_select',item.table_name);
      execute format('create policy %I on public.%I for select to authenticated using(public.has_module_write_permission(%L))','accounting_granted_module_select',item.table_name,item.module_name);
    end if;
  end loop;
end $$;
