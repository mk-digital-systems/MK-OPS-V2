-- Rol yapısı: Firma Yöneticisi / Şantiye Şefi / Muhasebe
--
-- Rol adları veritabanında aynı kalır, yalnızca anlamları netleşir:
--   site_chief       → Firma Yöneticisi (birden fazla olabilir; firmayı kuran kişi korunur)
--   company_manager  → Şantiye Şefi (operasyonun tamamı; fiyat/hakediş yalnızca izinle)
--   accounting       → Muhasebe (personel, puantaj, araç, stok ve hakediş)
--
-- Değişenler:
--   1. Firmada birden fazla Firma Yöneticisi olabilir; kurucu silinemez, rolü değiştirilemez.
--   2. "En fazla 3 yönetici / 2 muhasebe" sınırı kalkar; sınırı paketin kullanıcı limiti belirler.
--   3. Şantiye şefi kullanıcıları görür, katılım isteklerini Muhasebe olarak onaylar veya reddeder.
--   4. Rol atanırken o rolün varsayılan yetkileri yazılır.
--   5. Muhasebe araçları, yakıt kayıtlarını ve malzeme stokunu görür; irsaliye teslim alabilir.

-- 1. Firma yöneticisi korumaları ----------------------------------------------------------

-- Firmayı kuran Firma Yöneticisi (kurucu). Kurucu bilinmiyorsa en eski Firma Yöneticisi.
create or replace function public.company_primary_manager(p_company_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    (select c.owner_user_id
     from public.companies c
     join public.profiles p on p.id = c.owner_user_id and p.company_id = c.id and p.role = 'site_chief'
     where c.id = p_company_id),
    (select p.id from public.profiles p
     where p.company_id = p_company_id and p.role = 'site_chief'
     order by p.approved_at nulls last, p.created_at, p.id
     limit 1)
  );
$$;

comment on function public.company_primary_manager(uuid) is
  'Firmanın kurucu Firma Yöneticisi; silinemez ve rolü değiştirilemez';

revoke all on function public.company_primary_manager(uuid) from public, anon, authenticated;

create or replace function public.protect_primary_site_chief()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  v_primary_id uuid;
begin
  if current_setting('mk_ops.allow_company_reset', true) = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.company_id is not null then
    v_company_id := old.company_id;
  end if;

  if v_company_id is not null then
    v_primary_id := public.company_primary_manager(v_company_id);
  end if;

  if tg_op = 'DELETE' and old.id = v_primary_id then
    if exists (select 1 from public.companies where id = old.company_id) then
      raise exception 'Firmayı kuran yönetici hesabı silinemez'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.id = v_primary_id then
    if new.company_id is distinct from old.company_id
      or new.role <> 'site_chief'
      or new.is_approved is not true
      or new.approved_at is null then
      raise exception 'Firmayı kuran yöneticinin rolü ve onayı değiştirilemez'
        using errcode = '42501';
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.role = 'site_chief' then
    if v_primary_id is null then
      -- Firmanın ilk yöneticisi yalnızca firma kurulurken kendi onayıyla oluşur.
      if new.company_id is null
        or new.is_approved is not true
        or new.approved_at is null
        or new.approved_by is distinct from new.id then
        raise exception 'Firma yöneticisi yalnız korumalı rol ile oluşturulabilir'
          using errcode = '42501';
      end if;
    elsif new.id <> v_primary_id
      and (tg_op = 'INSERT' or old.role is distinct from 'site_chief') then
      -- Ek Firma Yöneticisini yalnızca bir Firma Yöneticisi atayabilir.
      if public.is_tenant_request() and not public.is_site_chief() then
        raise exception 'Firma yöneticisini yalnızca bir firma yöneticisi atayabilir'
          using errcode = '42501';
      end if;
      if new.company_id is null or new.is_approved is not true then
        raise exception 'Firma yöneticisi onaylı bir firma kullanıcısı olmalıdır'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- 2. Rol sınırları: yalnızca paketin kullanıcı limiti -----------------------------------------

create or replace function public.enforce_role_user_limits()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_count integer;
  v_user_limit integer;
begin
  perform pg_advisory_xact_lock(hashtext('mk-ops-role-assignment:' || coalesce(new.company_id::text, '')));

  if new.is_approved = true
    and new.company_id is not null
    and (tg_op = 'INSERT' or old.is_approved is distinct from true) then
    select user_limit into v_user_limit from public.companies where id = new.company_id;
    if v_user_limit is not null then
      select count(*)::integer
      into v_count
      from public.profiles
      where company_id = new.company_id
        and is_approved = true
        and id <> new.id;
      if v_count >= v_user_limit then
        raise exception 'Planınızın kullanıcı limitine (%) ulaşıldı', v_user_limit;
      end if;
    end if;
  end if;

  return new;
end;
$$;

comment on function public.enforce_role_user_limits() is
  'Onaylı kullanıcı sayısını paketin kullanıcı limitiyle sınırlar';

-- 3. Yetki yardımcıları -------------------------------------------------------------------

-- Kullanıcıları yönetebilen roller: Firma Yöneticisi ve Şantiye Şefi.
create or replace function public.can_manage_users()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.current_user_role() in ('site_chief', 'company_manager'), false);
$$;

comment on function public.can_manage_users() is
  'Firma Yöneticisi ve Şantiye Şefi kullanıcıları görür ve katılım isteklerini yönetir';

-- Araç ve malzeme kayıtlarını görebilen roller (Muhasebe dahil).
create or replace function public.can_view_resources()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.current_user_role() in ('site_chief', 'company_manager', 'accounting'), false);
$$;

comment on function public.can_view_resources() is
  'Araç, yakıt ve malzeme stok kayıtlarını görebilen roller';

revoke all on function public.can_manage_users() from public, anon;
revoke all on function public.can_view_resources() from public, anon;
grant execute on function public.can_manage_users() to authenticated;
grant execute on function public.can_view_resources() to authenticated;

-- Rol atanırken yazılan varsayılan yetkiler.
--   Şantiye Şefi: bütün operasyon alanları; hakediş ve fiyatlar Firma Yöneticisi izin verince.
--   Muhasebe: hakediş ve fiyatları görür; diğer işlem yetkileri Firma Yöneticisi verince.
create or replace function public.reset_role_permissions(p_user_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
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
end;
$$;

revoke all on function public.reset_role_permissions(uuid, text) from public, anon, authenticated;

-- 4. Rol atama ------------------------------------------------------------------------------

create or replace function public.assign_user_role(p_user_id uuid, p_role text)
returns public.profiles
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_caller_role text := public.current_user_role();
  v_company_id uuid := public.current_company_id();
  v_target public.profiles;
  v_profile public.profiles;
begin
  if v_caller_role not in ('site_chief', 'company_manager') or v_company_id is null then
    raise exception 'Bu işlem için firma yöneticisi veya şantiye şefi yetkisi gerekli'
      using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('mk-ops-role-assignment:' || v_company_id::text));

  if p_user_id = auth.uid() then
    raise exception 'Kendi rolünüzü değiştiremezsiniz';
  end if;
  if p_role not in ('site_chief', 'company_manager', 'accounting', 'pending') then
    raise exception 'Geçersiz kullanıcı rolü';
  end if;

  select * into v_target from public.profiles
  where id = p_user_id and company_id = v_company_id
  for update;
  if not found then
    raise exception 'Kullanıcı bulunamadı';
  end if;
  if p_user_id = public.company_primary_manager(v_company_id) then
    raise exception 'Firmayı kuran yöneticinin rolü değiştirilemez';
  end if;

  -- Şantiye şefi yalnızca muhasebe kullanıcılarını ve katılım isteklerini yönetir.
  if v_caller_role = 'company_manager' then
    if p_role not in ('accounting', 'pending') then
      raise exception 'Şantiye şefi yalnızca muhasebe rolü atayabilir'
        using errcode = '42501';
    end if;
    if v_target.role not in ('pending', 'accounting') then
      raise exception 'Bu kullanıcının rolünü yalnızca firma yöneticisi değiştirebilir'
        using errcode = '42501';
    end if;
  end if;

  update public.profiles
  set
    role = p_role,
    is_approved = p_role <> 'pending',
    approved_at = case when p_role <> 'pending' then now() else null end,
    approved_by = case when p_role <> 'pending' then auth.uid() else null end
  where id = p_user_id
  returning * into v_profile;

  if v_target.role is distinct from p_role or not v_target.is_approved then
    perform public.reset_role_permissions(p_user_id, p_role);
  end if;

  return v_profile;
end;
$$;

create or replace function public.reject_join_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not public.can_manage_users() or public.current_company_id() is null then
    raise exception 'Bu işlem için firma yöneticisi veya şantiye şefi yetkisi gerekli' using errcode = '42501';
  end if;

  perform set_config('mk_ops.allow_company_assignment', 'on', true);
  update public.profiles
  set company_id = null
  where id = p_user_id
    and company_id = public.current_company_id()
    and role = 'pending'
    and is_approved = false;
  if not found then
    raise exception 'Bekleyen katılım isteği bulunamadı';
  end if;
  perform set_config('mk_ops.allow_company_assignment', 'off', true);
end;
$$;

-- Modül yetkilerini yalnızca Firma Yöneticisi değiştirir (mesaj güncellendi).
create or replace function public.set_company_manager_permission(p_user_id uuid, p_module text, p_enabled boolean)
returns public.company_manager_permissions
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_permissions public.company_manager_permissions;
  v_role text;
begin
  if not public.is_site_chief() then
    raise exception 'Bu işlem için firma yöneticisi yetkisi gerekli' using errcode = '42501';
  end if;
  select role into v_role from public.profiles
  where company_id = public.current_company_id() and id = p_user_id and is_approved = true;
  if v_role is null or v_role not in ('company_manager', 'accounting') then
    raise exception 'Kullanıcı yetkilendirilebilir bir rolde değil';
  end if;
  if p_module not in ('projects', 'work_plans', 'personnel', 'attendance', 'vehicles', 'inventory', 'custody', 'productions', 'hakedis') then
    raise exception 'Geçersiz yetki alanı';
  end if;

  insert into public.company_manager_permissions (user_id, updated_by)
  values (p_user_id, auth.uid())
  on conflict (user_id) do nothing;

  update public.company_manager_permissions set
    projects_write = case when p_module = 'projects' then p_enabled else projects_write end,
    work_plans_write = case when p_module = 'work_plans' then p_enabled else work_plans_write end,
    personnel_write = case when p_module = 'personnel' then p_enabled else personnel_write end,
    attendance_write = case when p_module = 'attendance' then p_enabled else attendance_write end,
    vehicles_write = case when p_module = 'vehicles' then p_enabled else vehicles_write end,
    inventory_write = case when p_module = 'inventory' then p_enabled else inventory_write end,
    custody_write = case when p_module = 'custody' then p_enabled else custody_write end,
    productions_write = case when p_module = 'productions' then p_enabled else productions_write end,
    hakedis_write = case when p_module = 'hakedis' then p_enabled else hakedis_write end,
    updated_by = auth.uid()
  where user_id = p_user_id
  returning * into v_permissions;
  return v_permissions;
end;
$$;

-- 5. Görünürlük ------------------------------------------------------------------------------

-- Şantiye şefi firmadaki kullanıcıları görür (katılım isteklerini yönetebilmesi için).
drop policy if exists profiles_select_role_based on public.profiles;
create policy profiles_select_role_based on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.can_manage_users());

-- Muhasebe araçları, yakıt kayıtlarını ve malzeme stokunu görür.
drop policy if exists vehicles_select_role_based on public.vehicles;
create policy vehicles_select_role_based on public.vehicles
  for select to authenticated using (public.can_view_resources());

drop policy if exists vehicle_fuel_logs_select_role_based on public.vehicle_fuel_logs;
create policy vehicle_fuel_logs_select_role_based on public.vehicle_fuel_logs
  for select to authenticated using (public.can_view_resources());

drop policy if exists inventory_materials_select_role_based on public.inventory_materials;
create policy inventory_materials_select_role_based on public.inventory_materials
  for select to authenticated using (public.can_view_resources());

drop policy if exists inventory_movements_select_role_based on public.inventory_movements;
create policy inventory_movements_select_role_based on public.inventory_movements
  for select to authenticated using (public.can_view_resources());

-- Firma bilgisi: katılım kodu Firma Yöneticisi ve Şantiye Şefine döner; kurucu bilgisi eklendi.
create or replace function public.get_my_company()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_profile public.profiles;
  v_company public.companies;
begin
  if auth.uid() is null then
    return null;
  end if;

  select * into v_profile from public.profiles where id = auth.uid();
  if v_profile.company_id is not null then
    select * into v_company from public.companies where id = v_profile.company_id;
  end if;

  return jsonb_build_object(
    'is_super_admin', public.is_super_admin(),
    'company', case when v_company.id is null then null else jsonb_build_object(
      'id', v_company.id,
      'name', v_company.name,
      'access_status', public.company_access_status(v_company),
      'trial_ends_at', v_company.trial_ends_at,
      'plan', v_company.plan,
      'plan_ends_at', v_company.plan_ends_at,
      'user_limit', v_company.user_limit,
      'payroll_start_day', v_company.payroll_start_day,
      'currency_code', v_company.currency_code,
      'logo_path', v_company.logo_path,
      'primary_manager_id', case when v_profile.is_approved then public.company_primary_manager(v_company.id) end,
      -- Katılım kodunu yalnızca onaylı Firma Yöneticisi ve Şantiye Şefi görür.
      'join_code', case
        when v_profile.role in ('site_chief', 'company_manager') and v_profile.is_approved then v_company.join_code
      end
    ) end
  );
end;
$$;

-- 6. Muhasebe irsaliye teslim alabilir (yalnızca yetki satırı değişti) -------------------------

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

-- 7. Bildirimler: katılım istekleri Şantiye Şefine de gider (yalnızca v_users eklendi) ----------

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

-- 8. "ana yönetici" → "firma yöneticisi" (kalan fonksiyonlardaki hata mesajları) ----------------
do $$
declare
  v_function record;
  v_definition text;
begin
  for v_function in
    select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosrc ~* 'ana yönetici'
  loop
    v_definition := pg_get_functiondef(v_function.oid);
    v_definition := replace(v_definition, 'Ana yöneticinin', 'Firma yöneticisinin');
    v_definition := replace(v_definition, 'ana yöneticinin', 'firma yöneticisinin');
    v_definition := replace(v_definition, 'Ana yönetici', 'Firma yöneticisi');
    v_definition := replace(v_definition, 'ana yönetici', 'firma yöneticisi');
    execute v_definition;
  end loop;
end $$;

-- 9. Mevcut kullanıcılar yeni rol modeline uydurulur --------------------------------------------
-- Yalnızca yetki eklenir, hiçbir yetki kaldırılmaz:
--   Şantiye Şefi: bütün operasyon alanları açılır; hakediş/fiyat izni olduğu gibi kalır.
--   Muhasebe: hakediş ve fiyatları görür.
insert into public.company_manager_permissions (user_id, company_id)
select p.id, p.company_id
from public.profiles p
where p.is_approved and p.company_id is not null and p.role in ('company_manager', 'accounting')
on conflict (user_id) do nothing;

update public.company_manager_permissions cmp
set projects_write = true, work_plans_write = true, personnel_write = true, attendance_write = true,
    vehicles_write = true, inventory_write = true, custody_write = true, productions_write = true
from public.profiles p
where p.id = cmp.user_id and p.is_approved and p.role = 'company_manager';

update public.company_manager_permissions cmp
set hakedis_write = true
from public.profiles p
where p.id = cmp.user_id and p.is_approved and p.role = 'accounting';
