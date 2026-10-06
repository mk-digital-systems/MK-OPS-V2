-- =============================================================================
-- MK OPS — denetim kaydı (işlem geçmişi)
--
-- "Kim, ne zaman, neyi değiştirdi." Önemli tablolarda tek, genel bir tetikleyici
-- eklenen / değişen / silinen satırı ve alan bazında eski → yeni değeri yazar.
--
-- * Yalnızca doğrudan yapılan değişiklikler yazılır (pg_trigger_depth() = 1).
--   Başka tetikleyicilerin yaptığı türetilmiş güncellemeler (ilerleme yüzdesi,
--   aşama senkronu, zincirleme silmeler) kayda girmez; kayıt sade kalır.
-- * Kayıtlar değiştirilemez ve silinemez. Firma silinirken firma ile birlikte gider.
-- * Yalnızca firmanın ana yöneticisi görür.
-- * Puantajın kendi denetim kaydı (attendance_audit_logs) olduğu için puantaj burada yok.
-- =============================================================================

-- 1. Tablo ----------------------------------------------------------------------------
create table public.audit_logs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  actor_user_id uuid,
  actor_name text,
  actor_role text,
  module text not null,
  entity_type text not null,
  entity_id text,
  entity_label text,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes jsonb not null default '{}'::jsonb
);

comment on table public.audit_logs is 'İşlem geçmişi: kim, ne zaman, hangi kayıtta neyi değiştirdi (yalnızca ekleme)';
comment on column public.audit_logs.changes is 'update: {alan: {old, new}}; insert/delete: {alan: değer}';

create index idx_audit_logs_company_created on public.audit_logs (company_id, created_at desc);
create index idx_audit_logs_company_module on public.audit_logs (company_id, module, created_at desc);
create index idx_audit_logs_company_actor on public.audit_logs (company_id, actor_user_id, created_at desc);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

create policy "company_isolation" on public.audit_logs
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));

create policy "audit_logs_select_chief" on public.audit_logs
  for select to authenticated
  using (public.is_site_chief());

-- Değiştirilemez; silme yalnızca firma silinirken (zincirleme) olur.
create function public.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE'
    and (current_setting('mk_ops.allow_company_reset', true) = 'on'
      or not exists (select 1 from public.companies c where c.id = old.company_id)) then
    return old;
  end if;
  raise exception 'İşlem geçmişi kayıtları değiştirilemez' using errcode = '42501';
end;
$$;

create trigger audit_logs_immutable
before update or delete on public.audit_logs
for each row execute function public.audit_logs_immutable();

-- 2. Kayıt tetikleyicisi -----------------------------------------------------------------
-- TG_ARGV[0]: modül anahtarı; TG_ARGV[1] = 'always': alan değişmese de güncellemeyi yaz
-- (ör. iş planı kaydedildiğinde ekipler yeniden yazılır, plan satırında görünür alan değişmeyebilir).
create function public.audit_row_change()
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
    'stock_quantity', 'biga_stock_quantity', 'avatar_path', 'approved_at', 'approved_by',
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

revoke execute on function public.audit_row_change() from public, anon, authenticated;
revoke execute on function public.audit_logs_immutable() from public, anon, authenticated;

-- 3. Tetikleyicilerin bağlanması ------------------------------------------------------------
do $$
declare
  v_item record;
begin
  for v_item in
    select * from (values
      ('projects', 'projects', null),
      ('project_types', 'projects', null),
      ('project_sections', 'projects', null),
      ('project_stage_progress', 'projects', null),
      ('project_stage_logs', 'projects', null),
      ('hakedis_stage_prices', 'hakedis', null),
      ('hakedis_project_prices', 'hakedis', null),
      ('personnel', 'personnel', null),
      ('personnel_advances', 'personnel', null),
      ('vehicles', 'vehicles', null),
      ('inventory_catalog', 'inventory', null),
      ('inventory_materials', 'inventory', null),
      ('daily_work_plans', 'work_plans', 'always'),
      ('production_entries', 'productions', 'always'),
      ('profiles', 'users', null),
      ('company_manager_permissions', 'users', null),
      ('companies', 'settings', null)
    ) as t(table_name, module, mode)
  loop
    execute format(
      'create trigger zz_audit_row_change after insert or update or delete on public.%I
       for each row execute function public.audit_row_change(%L%s)',
      v_item.table_name, v_item.module,
      case when v_item.mode is null then '' else format(', %L', v_item.mode) end
    );
  end loop;
end $$;
