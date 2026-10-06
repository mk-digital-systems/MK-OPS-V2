-- =============================================================================
-- MK OPS — stok düzeltmeleri (20261011000001 sonrası)
--
-- * Hata mesajlarında miktar "50.000" yerine "50" (trim_scale); "Merkez Depo deposunda"
--   gibi tekrarlar yerine "Merkez Depo: ..." biçimi.
-- * İşlem geçmişinde yeni depo ve kategori kayıtlarının adı görünür; kaldırılan
--   biga_stock_quantity sütunu yok sayılanlar listesinden çıkarıldı.
-- Tümü CREATE OR REPLACE; tekrar çalıştırılması zararsızdır.
-- =============================================================================

create or replace function public.inventory_adjust_stock(p_material_id uuid, p_location_id uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_location public.inventory_locations;
  v_material public.inventory_materials;
  v_current numeric;
  v_new numeric;
begin
  select * into v_location from public.inventory_locations
  where id = p_location_id and company_id = public.current_company_id();
  if not found then raise exception 'Depo bulunamadı'; end if;
  select * into v_material from public.inventory_materials
  where id = p_material_id and company_id = public.current_company_id() for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;

  if v_location.is_main then
    v_current := v_material.stock_quantity;
  else
    select quantity into v_current from public.inventory_location_stocks
    where material_id = p_material_id and location_id = p_location_id for update;
    v_current := coalesce(v_current, 0);
  end if;

  v_new := v_current + p_delta;
  if v_new < 0 then
    raise exception '%: % stoku yetersiz. Mevcut: %', v_location.name, v_material.material_name, trim_scale(v_current);
  end if;

  if v_location.is_main then
    update public.inventory_materials set stock_quantity = v_new, updated_by = auth.uid() where id = p_material_id;
  elsif v_new = 0 then
    delete from public.inventory_location_stocks where material_id = p_material_id and location_id = p_location_id;
  else
    insert into public.inventory_location_stocks (company_id, material_id, location_id, quantity)
    values (v_material.company_id, p_material_id, p_location_id, v_new)
    on conflict (material_id, location_id) do update set quantity = excluded.quantity, updated_at = now();
  end if;
  return v_new;
end;
$$;

create or replace function public.delete_inventory_location(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_location public.inventory_locations;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode = '42501'; end if;
  select * into v_location from public.inventory_locations where id = p_id and company_id = public.current_company_id();
  if not found then raise exception 'Depo bulunamadı'; end if;
  if v_location.is_main then raise exception 'Ana depo silinemez; adını değiştirebilirsiniz'; end if;
  if exists (select 1 from public.inventory_location_stocks where location_id = p_id and quantity > 0) then
    raise exception '%: depoda stok var. Önce stoğu başka depoya sevk edin.', v_location.name;
  end if;
  if exists (select 1 from public.inventory_movements where p_id in (source_location_id, target_location_id))
    or exists (select 1 from public.inventory_shipments where p_id in (from_location_id, to_location_id)) then
    raise exception '%: deponun hareket geçmişi var; silinemez', v_location.name;
  end if;
  delete from public.inventory_location_stocks where location_id = p_id;
  delete from public.inventory_locations where id = p_id;
end;
$$;

create or replace function public.transfer_inventory_custody(p_material_id uuid, p_quantity numeric, p_from_type text, p_from_id uuid, p_to_type text, p_to_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_material public.inventory_materials;
  v_source public.inventory_custody_balances;
  v_from_name text;
  v_to_name text;
  v_source_remaining numeric(14,3);
  v_destination_quantity numeric(14,3);
  v_warehouse_name text := coalesce(public.inventory_location_name(public.inventory_main_location(public.current_company_id())), 'Depo');
begin
  if not public.has_module_write_permission('custody') then
    raise exception 'Araç ekipmanı işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Miktar sıfırdan büyük olmalıdır'; end if;
  if p_from_type not in ('warehouse','personnel','team','vehicle')
    or p_to_type not in ('warehouse','personnel','team','vehicle') then
    raise exception 'Geçersiz transfer konumu';
  end if;
  if (p_from_type = 'warehouse' and p_from_id is not null)
    or (p_from_type <> 'warehouse' and p_from_id is null)
    or (p_to_type = 'warehouse' and p_to_id is not null)
    or (p_to_type <> 'warehouse' and p_to_id is null) then
    raise exception 'Transfer konumu bilgisi geçersiz';
  end if;
  if p_from_type = p_to_type and p_from_id is not distinct from p_to_id then
    raise exception 'Kaynak ve hedef aynı olamaz';
  end if;

  select * into v_material from public.inventory_materials
  where company_id=public.current_company_id() and id = p_material_id for update;
  if not found then raise exception 'Malzeme bulunamadı'; end if;
  if v_material.unit = 'piece' and p_quantity <> trunc(p_quantity) then
    raise exception 'Adet biriminde miktar tam sayı olmalıdır';
  end if;

  if p_from_type = 'warehouse' then
    if v_material.stock_quantity < p_quantity then
      raise exception '%: yetersiz miktar. Mevcut: %', v_warehouse_name, trim_scale(v_material.stock_quantity);
    end if;
    v_from_name := v_warehouse_name;
    update public.inventory_materials set stock_quantity = stock_quantity - p_quantity,
      updated_by = auth.uid() where id = p_material_id;
    v_source_remaining := v_material.stock_quantity - p_quantity;
  else
    select * into v_source from public.inventory_custody_balances
    where company_id=public.current_company_id() and material_id = p_material_id and holder_type = p_from_type
      and holder_id = p_from_id for update;
    if not found or v_source.quantity < p_quantity then raise exception 'Kaynakta yetersiz malzeme'; end if;
    v_from_name := v_source.holder_name;
    v_source_remaining := v_source.quantity - p_quantity;
    if v_source_remaining = 0 then
      delete from public.inventory_custody_balances where company_id=public.current_company_id() and id = v_source.id;
    else
      update public.inventory_custody_balances set quantity = v_source_remaining,
        updated_by = auth.uid() where id = v_source.id;
    end if;
  end if;

  if p_to_type = 'warehouse' then
    v_to_name := v_warehouse_name;
    update public.inventory_materials set stock_quantity = stock_quantity + p_quantity,
      updated_by = auth.uid() where id = p_material_id returning stock_quantity into v_destination_quantity;
  else
    if p_to_type = 'vehicle' then
      select plate into v_to_name from public.vehicles where company_id=public.current_company_id() and id = p_to_id;
    elsif p_to_type = 'personnel' then
      select full_name into v_to_name from public.personnel where company_id=public.current_company_id() and id = p_to_id;
    else
      select concat('Ekip · ', team_type, ' · ', project_name) into v_to_name
      from public.daily_work_plan_teams where company_id=public.current_company_id() and id = p_to_id;
    end if;
    if v_to_name is null then raise exception 'Hedef bulunamadı'; end if;
    insert into public.inventory_custody_balances
      (material_id, holder_type, holder_id, holder_name, quantity, updated_by)
    values (p_material_id, p_to_type, p_to_id, v_to_name, p_quantity, auth.uid())
    on conflict (material_id, holder_type, holder_id) do update set
      quantity = public.inventory_custody_balances.quantity + excluded.quantity,
      holder_name = excluded.holder_name, updated_by = auth.uid()
    returning quantity into v_destination_quantity;
  end if;

  insert into public.inventory_custody_movements
    (material_id, from_type, from_id, from_name, to_type, to_id, to_name, quantity, notes, created_by)
  values (p_material_id, p_from_type, p_from_id, v_from_name,
    p_to_type, p_to_id, v_to_name, p_quantity, nullif(trim(p_notes),''), auth.uid());
  return jsonb_build_object('material_id',p_material_id,'source_remaining',v_source_remaining,
    'destination_quantity',v_destination_quantity);
end;
$$;

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_company_id uuid;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_label text;
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  -- Kayda yazılmayan teknik / türetilmiş alanlar
  v_ignored text[] := array[
    'id', 'company_id', 'created_at', 'updated_at', 'created_by', 'updated_by',
    'progress_percent', 'has_activity', 'status_sort_order', 'priority_order',
    'waiting_at', 'in_progress_at', 'on_hold_at', 'delayed_at', 'archived_at',
    'cancelled_at', 'cancelled_by', 'done_quantity', 'percent', 'started_at',
    'stock_quantity', 'avatar_path', 'approved_at', 'approved_by',
    'priced_at', 'owner_user_id'
  ];
  -- Değeri gösterilmeyen hassas alanlar
  v_masked text[] := array['tc_identity_number'];
begin
  if pg_trigger_depth() > 1 or current_setting('mk_ops.allow_company_reset', true) = 'on' then
    return null;
  end if;

  v_company_id := case
    when tg_table_name = 'companies' then (v_row ->> 'id')::uuid
    else coalesce((v_new ->> 'company_id')::uuid, (v_old ->> 'company_id')::uuid)
  end;
  if v_company_id is null or not exists (select 1 from public.companies c where c.id = v_company_id) then
    return null;
  end if;

  if tg_op = 'UPDATE' then
    for v_key in select jsonb_object_keys(v_new) loop
      continue when v_key = any (v_ignored);
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key,
          case when v_key = any (v_masked)
            then jsonb_build_object('old', '***', 'new', '***')
            else jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key)
          end);
      end if;
    end loop;
    if v_changes = '{}'::jsonb and coalesce(tg_argv[1], '') <> 'always' then
      return null;
    end if;
  else
    for v_key in select jsonb_object_keys(v_row) loop
      continue when v_key = any (v_ignored) or jsonb_typeof(v_row -> v_key) = 'null';
      v_changes := v_changes || jsonb_build_object(v_key,
        case when v_key = any (v_masked) then to_jsonb('***'::text) else v_row -> v_key end);
    end loop;
  end if;

  v_label := case tg_table_name
    when 'projects' then concat_ws(' · ', v_row ->> 'name', v_row ->> 'project_code')
    when 'project_types' then v_row ->> 'name'
    when 'project_sections' then (
      select concat_ws(' · ', p.name, v_row ->> 'name') from public.projects p where p.id = (v_row ->> 'project_id')::uuid)
    when 'project_stage_progress' then (
      select concat_ws(' · ', p.name, ps.name, st.name)
      from public.projects p
      left join public.project_sections ps on ps.id = (v_row ->> 'section_id')::uuid
      left join public.project_type_stages st on st.id = (v_row ->> 'stage_id')::uuid
      where p.id = (v_row ->> 'project_id')::uuid)
    when 'project_stage_logs' then (
      select concat_ws(' · ', p.name, ps.name, st.name)
      from public.project_stage_progress pr
      join public.projects p on p.id = pr.project_id
      left join public.project_sections ps on ps.id = pr.section_id
      left join public.project_type_stages st on st.id = pr.stage_id
      where pr.id = (v_row ->> 'progress_id')::uuid)
    when 'hakedis_stage_prices' then (
      select concat_ws(' · ', t.name, st.name)
      from public.project_type_stages st join public.project_types t on t.id = st.project_type_id
      where st.id = (v_row ->> 'stage_id')::uuid)
    when 'hakedis_project_prices' then (
      select concat_ws(' · ', p.name, ps.name, st.name)
      from public.project_stage_progress pr
      join public.projects p on p.id = pr.project_id
      left join public.project_sections ps on ps.id = pr.section_id
      left join public.project_type_stages st on st.id = pr.stage_id
      where pr.id = (v_row ->> 'progress_id')::uuid)
    when 'personnel' then v_row ->> 'full_name'
    when 'personnel_advances' then (
      select p.full_name from public.personnel p where p.id = (v_row ->> 'personnel_id')::uuid)
    when 'vehicles' then v_row ->> 'plate'
    when 'inventory_catalog' then v_row ->> 'material_name'
    when 'inventory_materials' then concat_ws(' · ', v_row ->> 'material_name', v_row ->> 'material_code')
    when 'inventory_categories' then v_row ->> 'name'
    when 'inventory_locations' then v_row ->> 'name'
    when 'daily_work_plans' then 'İş planı ' || to_char((v_row ->> 'plan_date')::date, 'DD.MM.YYYY')
    when 'production_entries' then concat_ws(' · ',
      to_char((v_row ->> 'work_date')::date, 'DD.MM.YYYY'), v_row ->> 'team_leader_name_snapshot')
    when 'profiles' then coalesce(nullif(v_row ->> 'full_name', ''), v_row ->> 'email')
    when 'company_manager_permissions' then (
      select coalesce(nullif(pr.full_name, ''), pr.email) from public.profiles pr where pr.id = (v_row ->> 'user_id')::uuid)
    when 'companies' then v_row ->> 'name'
    else null
  end;

  -- Üst kayıt (proje / personel / aşama) silinirken zincirleme silinen alt satırlar yazılmaz;
  -- üst kaydın silinmesi zaten kayıtta.
  if tg_op = 'DELETE' and v_label is null and tg_table_name in (
    'project_sections', 'project_stage_progress', 'project_stage_logs',
    'hakedis_stage_prices', 'hakedis_project_prices', 'personnel_advances',
    'company_manager_permissions'
  ) then
    return null;
  end if;

  if v_actor is not null then
    select coalesce(nullif(p.full_name, ''), p.email), p.role
    into v_actor_name, v_actor_role
    from public.profiles p where p.id = v_actor;
    if public.is_super_admin() then
      v_actor_role := 'super_admin';
      v_actor_name := coalesce(v_actor_name, 'MK OPS Destek');
    end if;
  end if;

  insert into public.audit_logs
    (company_id, actor_user_id, actor_name, actor_role, module, entity_type, entity_id, entity_label, action, changes)
  values (
    v_company_id,
    v_actor,
    coalesce(v_actor_name, case when v_actor is null then 'Sistem' end),
    v_actor_role,
    tg_argv[0],
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'user_id'),
    left(v_label, 300),
    lower(tg_op),
    v_changes
  );
  return null;
end;
$$;
