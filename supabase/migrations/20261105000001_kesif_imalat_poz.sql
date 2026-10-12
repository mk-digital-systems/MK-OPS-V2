-- Keşif ve imalatta poz (F3)
--
--   Katalogdan kurulan türlerin projeleri (project_types.catalog_type_id dolu):
--   * İş kalemleri firmanın poz listesinden gelir; türe kalem tanımlanmaz.
--   * Keşif isteğe bağlıdır ve firma girer (save_project_kesif): poz + miktar → proje satırının hedef miktarı.
--   * İmalatta poz seçilir; projede o pozun satırı yoksa açılır (ensure_project_poz_row). HP projesinde
--     isteğe bağlı pafta iş kaydına ve imalat satırına yazılır.
--   * İlerleme yüzdesi keşfin ilerlemesidir. Keşif tamamlansa da proje TAMAMLANMAZ (keşif dışı iş olabilir);
--     "Tamamlandı" her zaman elle. İlk imalatla proje "Devam ediyor" olur.
--   * Hakediş: iş kaydı, iş tarihinde geçerli poz fiyatıyla sabitlenir (projeye özel fiyat önceliklidir).
--     Fiyatı sonradan girilen poz, fiyatsız kalmış kayıtlarını o tarihlere göre fiyatlar.
--   Eski (katalogsuz) türlerin projeleri F4'teki geçişe kadar bugünkü gibi çalışır.

-- 1. Pafta bağı -----------------------------------------------------------------------------------
alter table public.project_stage_logs
  add column sheet_id uuid,
  add constraint project_stage_logs_sheet_fkey foreign key (company_id, sheet_id)
    references public.project_hp_sheets (company_id, id) on delete set null (sheet_id);
alter table public.production_items
  add column sheet_id uuid,
  add constraint production_items_sheet_fkey foreign key (company_id, sheet_id)
    references public.project_hp_sheets (company_id, id) on delete set null (sheet_id);

comment on column public.project_stage_logs.sheet_id is 'HP projesinde işin yapıldığı pafta (isteğe bağlı)';

-- 2. Katalog türlerine kalem tanımlanmaz (poz listesi kullanılır) ----------------------------------
create or replace function public.guard_addon_type_stages()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.project_type_id is not null and exists (
    select 1 from public.project_types t
    where t.id = new.project_type_id and (t.screen <> 'standard' or t.catalog_type_id is not null)
  ) then
    raise exception 'HP odaklı, kurumsal ve katalog türlerinde iş kalemi tanımlanmaz; poz listesi kullanılır';
  end if;
  return new;
end;
$$;

-- 3. Projede poz satırı (yoksa açılır) ------------------------------------------------------------
create function public.ensure_project_poz_row(p_project_id uuid, p_stage_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project public.projects;
  v_stage public.project_type_stages;
  v_catalog uuid;
  v_id uuid;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then
    raise exception 'Proje bulunamadı';
  end if;
  select ct.catalog_id into v_catalog
  from public.project_types t
  join public.catalog_project_types ct on ct.id = t.catalog_type_id
  where t.id = v_project.project_type_id;
  if v_catalog is null then
    raise exception 'Bu projenin türü katalogdan kurulmamış; poz seçilemez';
  end if;
  select * into v_stage from public.project_type_stages
  where id = p_stage_id and company_id = v_project.company_id and project_type_id is null;
  if v_stage.id is null or v_stage.catalog_id is distinct from v_catalog then
    raise exception 'Seçilen poz bu projenin kataloğunda değil';
  end if;

  select id into v_id from public.project_stage_progress
  where project_id = p_project_id and section_id is null and stage_id = p_stage_id;
  if v_id is not null then
    return v_id;
  end if;
  if not v_stage.is_active then
    raise exception 'Pasif poz yeni işte kullanılamaz: %', v_stage.name;
  end if;
  insert into public.project_stage_progress (company_id, project_id, section_id, stage_id)
  values (v_project.company_id, p_project_id, null, p_stage_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- 4. Poz projesinin ilerlemesi: keşfin yüzdesi; durum değiştirilmez (tamamlama elle) ----------------
create function public.refresh_poz_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_kesif integer;
  v_percent numeric;
  v_activity boolean;
  v_last_log record;
begin
  select count(*), coalesce(avg(percent), 0) into v_kesif, v_percent
  from public.project_stage_progress
  where project_id = p_project_id and target_quantity is not null;

  select exists (
    select 1 from public.project_stage_logs l
    join public.project_stage_progress p on p.id = l.progress_id
    where p.project_id = p_project_id
  ) into v_activity;

  select l.team_leader_personnel_id, l.team_leader_name into v_last_log
  from public.project_stage_logs l
  join public.project_stage_progress p on p.id = l.progress_id
  where p.project_id = p_project_id and l.team_leader_name is not null
  order by l.log_date desc, l.created_at desc
  limit 1;

  update public.projects
  set
    progress_percent = case when v_kesif = 0 then 0 else round(v_percent)::integer end,
    has_activity = has_activity or v_activity,
    current_team_leader_personnel_id = coalesce(v_last_log.team_leader_personnel_id, current_team_leader_personnel_id),
    current_team_leader_name = coalesce(v_last_log.team_leader_name, current_team_leader_name)
  where id = p_project_id;
end;
$$;

-- 5. Keşif (firma girer) -------------------------------------------------------------------------
-- p_items: [{ "stage_id": uuid, "quantity": number }, …]; listede olmayan pozların keşfi kalkar
-- (iş kaydı olmayan satır silinir).
create function public.save_project_kesif(p_project_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project public.projects;
  v_item jsonb;
  v_id uuid;
  v_qty numeric;
  v_keep uuid[] := '{}';
begin
  if not public.has_module_write_permission('projects') then
    raise exception 'Proje düzenleme yetkiniz yok' using errcode = '42501';
  end if;
  select * into v_project from public.projects
  where id = p_project_id and company_id = public.current_company_id()
  for update;
  if not found then
    raise exception 'Proje bulunamadı';
  end if;
  if not public.can_access_branch(v_project.branch_id) then
    raise exception 'Bu kayıt erişiminiz olmayan bir şubeye ait' using errcode = '42501';
  end if;
  if v_project.is_archived or v_project.is_cancelled then
    raise exception 'Arşivdeki veya iptal edilen projenin keşfi değiştirilemez';
  end if;
  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' then
    raise exception 'Geçersiz keşif listesi';
  end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_qty := nullif(trim(coalesce(v_item ->> 'quantity', '')), '')::numeric;
    v_id := public.ensure_project_poz_row(p_project_id, nullif(v_item ->> 'stage_id', '')::uuid);
    if v_qty is null or v_qty <= 0 then
      raise exception '% için keşif miktarı sıfırdan büyük olmalı',
        (select name from public.project_type_stages where id = (v_item ->> 'stage_id')::uuid);
    end if;
    if v_id = any (v_keep) then
      raise exception 'Aynı poz keşifte iki kez var';
    end if;
    v_keep := v_keep || v_id;
    update public.project_stage_progress set target_quantity = v_qty where id = v_id;
  end loop;

  update public.project_stage_progress sp
  set target_quantity = null,
      status = case when exists (select 1 from public.project_stage_logs l where l.progress_id = sp.id)
                    then 'in_progress' else 'not_started' end
  where sp.project_id = p_project_id and sp.target_quantity is not null and not (sp.id = any (v_keep));

  delete from public.project_stage_progress sp
  where sp.project_id = p_project_id and sp.target_quantity is null and not (sp.id = any (v_keep))
    and not exists (select 1 from public.project_stage_logs l where l.progress_id = sp.id)
    and exists (select 1 from public.project_type_stages st where st.id = sp.stage_id and st.project_type_id is null);

  perform public.refresh_project_rollup(p_project_id);
end;
$$;

-- 5b. Hakediş fiyatı: projeye özel → (poz ise) iş tarihindeki poz fiyatı → (eski kalemse) kalem fiyatı -----
create function public.hakedis_log_price(p_progress_id uuid, p_date date)
returns numeric
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(
    pp.unit_price,
    case when st.project_type_id is null then public.poz_price_at(st.id, p_date) else sp.unit_price end
  )
  from public.project_stage_progress p
  join public.project_type_stages st on st.id = p.stage_id
  left join public.hakedis_project_prices pp on pp.progress_id = p.id
  left join public.hakedis_stage_prices sp on sp.stage_id = p.stage_id
  where p.id = p_progress_id;
$$;

-- Poz fiyatı girilince/değişince bu pozun fiyatsız kalmış kayıtları (tarihine göre) fiyatlanır.
create function public.on_poz_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.hakedis_price_pending_logs(
    coalesce((select array_agg(id) from public.project_stage_progress where stage_id = new.stage_id), '{}')
  );
  return null;
end;
$$;

create trigger poz_prices_price_pending_logs
after insert or update on public.poz_prices
for each row execute function public.on_poz_price_change();

-- 6. Proje durumu: HP/kurumsal atlanır, katalog türleri poz kuralıyla (gövdenin geri kalanı 20261007000001 ile aynı)
create or replace function public.refresh_project_rollup(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project public.projects;
  v_has_sections boolean;
  v_percent numeric := 0;
  v_unit_count integer := 0;
  v_all_done boolean := false;
  v_activity boolean := false;
  v_last_log record;
  v_screen text;
  v_catalog_type boolean;
begin
  select * into v_project from public.projects where id = p_project_id for update;
  if not found then return; end if;

  -- HP ve kurumsal projelerin durumu paftalardan / elle; katalogdan kurulan standart türler poz kuralıyla.
  select t.screen, t.catalog_type_id is not null into v_screen, v_catalog_type
  from public.project_types t where t.id = v_project.project_type_id;
  if v_screen <> 'standard' then
    return;
  end if;
  if v_catalog_type then
    perform public.refresh_poz_project(p_project_id);
    return;
  end if;
  select has_sections into v_has_sections from public.project_types where id = v_project.project_type_id;

  -- Birim: bölümlü projede her bölüm, değilse projenin kendisi.
  select coalesce(avg(unit_percent), 0), count(*), coalesce(bool_and(unit_done), false)
  into v_percent, v_unit_count, v_all_done
  from (
    select avg(p.percent) as unit_percent, bool_and(p.status = 'done') as unit_done
    from public.project_stage_progress p
    where p.project_id = p_project_id
      and (case when v_has_sections then p.section_id is not null else p.section_id is null end)
    group by p.section_id
  ) units;

  select exists (
    select 1 from public.project_stage_progress p
    where p.project_id = p_project_id and p.status <> 'not_started'
  ) into v_activity;

  select l.team_leader_personnel_id, l.team_leader_name
  into v_last_log
  from public.project_stage_logs l
  join public.project_stage_progress p on p.id = l.progress_id
  where p.project_id = p_project_id and l.team_leader_name is not null
  order by l.log_date desc, l.created_at desc
  limit 1;

  update public.projects
  set
    progress_percent = case when v_unit_count = 0 then 0 else round(v_percent)::integer end,
    has_activity = v_activity,
    current_team_leader_personnel_id = coalesce(v_last_log.team_leader_personnel_id, current_team_leader_personnel_id),
    current_team_leader_name = coalesce(v_last_log.team_leader_name, current_team_leader_name),
    status = case
      when v_unit_count > 0 and v_all_done and status <> 'on_hold' then 'completed'::public.project_status
      -- Otomatik tamamlanmış proje, bir aşama geri alınırsa yeniden açılır.
      when status = 'completed' and v_unit_count > 0 and not v_all_done then 'in_progress'::public.project_status
      else status
    end,
    completed_by_personnel_id = case
      when v_unit_count > 0 and v_all_done then coalesce(v_last_log.team_leader_personnel_id, completed_by_personnel_id)
      else completed_by_personnel_id end,
    completed_by_name = case
      when v_unit_count > 0 and v_all_done then coalesce(v_last_log.team_leader_name, completed_by_name)
      else completed_by_name end
  where id = p_project_id;
end;
$$;

-- 7. Hakediş: iş tarihindeki fiyat (gövdenin geri kalanı 20261008000001 ile aynı)
create or replace function public.hakedis_price_pending_logs(p_progress_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  insert into public.hakedis_log_values (log_id, company_id, unit_price, amount)
  select l.id, l.company_id, price.value, round(l.quantity * price.value, 2)
  from public.project_stage_logs l
  cross join lateral (select public.hakedis_log_price(l.progress_id, l.log_date) as value) price
  where l.progress_id = any (p_progress_ids)
    and l.quantity is not null
    and price.value is not null
    and not exists (select 1 from public.hakedis_log_values v where v.log_id = l.id);
end;
$$;

-- 8. İmalat: poz seçimi ve pafta (gövdenin geri kalanı 20261015000001 ile aynı)
create or replace function public.save_production_entry(
  p_entry_id uuid, p_work_date date, p_team_leader_personnel_id uuid, p_team_leader_name text,
  p_source_work_plan_id uuid, p_jobs jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
  v_can_price boolean := public.has_module_write_permission('hakedis');
  v_leader_name text := left(trim(coalesce(p_team_leader_name, '')), 120);
  v_entry_id uuid;
  v_job jsonb;
  v_item jsonb;
  v_job_id uuid;
  v_item_id uuid;
  v_project public.projects;
  v_progress public.project_stage_progress;
  v_stage public.project_type_stages;
  v_section_name text;
  v_kind text;
  v_name text;
  v_unit text;
  v_qty numeric;
  v_price numeric;
  v_log_id uuid;
  v_sheet_id uuid;
  v_poz_progress_id uuid;
  v_old_links jsonb;
  v_old_prices jsonb;
  v_kept uuid[] := '{}';
begin
  if not public.has_module_write_permission('productions') then
    raise exception 'İmalat yazma yetkisi gerekli' using errcode = '42501';
  end if;
  if p_work_date is null then raise exception 'Tarih zorunlu'; end if;
  if not exists (
    select 1 from public.personnel
    where company_id = v_company and id = p_team_leader_personnel_id and is_active = true
  ) then
    raise exception 'Aktif ekip personeli bulunamadı';
  end if;
  if jsonb_array_length(coalesce(p_jobs, '[]'::jsonb)) = 0 then
    raise exception 'En az bir proje gerekli';
  end if;

  if p_entry_id is not null and exists (select 1 from public.production_entries where company_id = v_company and id = p_entry_id) then
    update public.production_entries set
      work_date = p_work_date,
      team_leader_personnel_id = p_team_leader_personnel_id,
      team_leader_name_snapshot = trim(p_team_leader_name),
      source_work_plan_id = null,
      updated_by = auth.uid()
    where id = p_entry_id
    returning id into v_entry_id;
  else
    insert into public.production_entries (work_date, team_leader_personnel_id, team_leader_name_snapshot, source_work_plan_id, created_by, updated_by)
    values (p_work_date, p_team_leader_personnel_id, trim(p_team_leader_name), null, auth.uid(), auth.uid())
    on conflict (work_date, team_leader_personnel_id) do update set
      team_leader_name_snapshot = excluded.team_leader_name_snapshot,
      source_work_plan_id = null,
      updated_by = auth.uid()
    returning id into v_entry_id;
  end if;

  -- Önceki satırların proje bağlantıları ve ek iş fiyatları (eski satır kimliğine göre)
  select coalesce(jsonb_object_agg(i.id::text, jsonb_build_object('log', i.stage_log_id, 'progress', i.progress_id)), '{}'::jsonb)
  into v_old_links
  from public.production_items i
  join public.production_jobs j on j.id = i.production_job_id
  where j.production_entry_id = v_entry_id and i.stage_log_id is not null;

  select coalesce(jsonb_object_agg(i.id::text, x.unit_price), '{}'::jsonb)
  into v_old_prices
  from public.production_items i
  join public.production_jobs j on j.id = i.production_job_id
  join public.hakedis_extra_values x on x.production_item_id = i.id
  where j.production_entry_id = v_entry_id;

  perform set_config('mk_ops.production_sync', 'on', true);
  delete from public.production_jobs where company_id = v_company and production_entry_id = v_entry_id;

  for v_job in select * from jsonb_array_elements(p_jobs) loop
    v_project := null;
    if nullif(v_job->>'project_id', '') is not null then
      select * into v_project from public.projects where company_id = v_company and id = (v_job->>'project_id')::uuid;
      if v_project.id is null then raise exception 'Proje bulunamadı'; end if;
    elsif char_length(trim(coalesce(v_job->>'project_name', ''))) < 2 then
      raise exception 'Her iş için proje seçin veya başlık yazın';
    end if;

    insert into public.production_jobs (production_entry_id, project_id, project_name_snapshot, project_code_snapshot, source, sort_order)
    values (
      v_entry_id, v_project.id,
      coalesce(v_project.name, trim(v_job->>'project_name')),
      coalesce(v_project.project_code, nullif(trim(v_job->>'project_code'), '')),
      'manual', coalesce((v_job->>'sort_order')::int, 0)
    )
    returning id into v_job_id;

    if jsonb_array_length(coalesce(v_job->'items', '[]'::jsonb)) = 0 then
      raise exception 'Her işte en az bir imalat satırı gerekli';
    end if;

    for v_item in select * from jsonb_array_elements(coalesce(v_job->'items', '[]'::jsonb)) loop
      v_kind := coalesce(nullif(v_item->>'kind', ''), 'note');
      v_qty := nullif(v_item->>'quantity', '')::numeric;
      v_log_id := null;
      v_sheet_id := null;
      v_progress := null;

      if v_kind = 'stage' then
        if v_project.id is null then raise exception 'İş kalemi seçmek için listeden proje seçin'; end if;
        if nullif(v_item->>'progress_id', '') is null and nullif(v_item->>'stage_id', '') is not null then
          -- Poz seçildi: projede satırı yoksa açılır.
          v_poz_progress_id := public.ensure_project_poz_row(v_project.id, (v_item->>'stage_id')::uuid);
          select * into v_progress from public.project_stage_progress where id = v_poz_progress_id;
        else
          select * into v_progress from public.project_stage_progress
          where company_id = v_company and id = nullif(v_item->>'progress_id', '')::uuid and project_id = v_project.id;
        end if;
        if v_progress.id is null then raise exception 'Seçilen iş kalemi bu projeye ait değil'; end if;
        select * into v_stage from public.project_type_stages where id = v_progress.stage_id;
        if v_stage.unit is null then raise exception '% iş kaleminin birimi yok; metraj girilemez', v_stage.name; end if;
        if v_qty is null or v_qty <= 0 then raise exception '% için miktar sıfırdan büyük olmalı', v_stage.name; end if;
        select name into v_section_name from public.project_sections where id = v_progress.section_id;
        v_name := concat_ws(' · ', v_section_name, v_stage.poz_code, v_stage.name);
        v_sheet_id := nullif(v_item->>'sheet_id', '')::uuid;
        if v_sheet_id is not null and not exists (
          select 1 from public.project_hp_sheets where id = v_sheet_id and project_id = v_project.id
        ) then
          raise exception 'Seçilen pafta bu projeye ait değil';
        end if;
        v_unit := v_stage.unit;

        -- Aynı satır aynı iş kalemiyle kaldıysa iş kaydı güncellenir (fiyat sabitlemesi korunur).
        if v_old_links ? coalesce(v_item->>'item_id', '')
          and (v_old_links -> (v_item->>'item_id') ->> 'progress') = v_progress.id::text then
          update public.project_stage_logs set
            quantity = v_qty, log_date = p_work_date,
            team_leader_personnel_id = p_team_leader_personnel_id, team_leader_name = v_leader_name
          where id = (v_old_links -> (v_item->>'item_id') ->> 'log')::uuid
          returning id into v_log_id;
        end if;
        if v_log_id is null then
          insert into public.project_stage_logs
            (company_id, progress_id, log_date, quantity, team_leader_personnel_id, team_leader_name, notes, created_by, source)
          values (v_company, v_progress.id, p_work_date, v_qty, p_team_leader_personnel_id, v_leader_name, 'İmalat kaydı', auth.uid(), 'production')
          returning id into v_log_id;
        end if;
        update public.project_stage_logs set sheet_id = v_sheet_id where id = v_log_id and sheet_id is distinct from v_sheet_id;
        v_kept := v_kept || v_log_id;
      elsif v_kind = 'extra' then
        v_name := trim(coalesce(v_item->>'item_name', ''));
        v_unit := trim(coalesce(v_item->>'unit', ''));
        if char_length(v_name) < 2 then raise exception 'Ek iş açıklaması zorunlu'; end if;
        if char_length(v_unit) < 1 then raise exception '% için birim zorunlu', v_name; end if;
        if v_qty is null or v_qty <= 0 then raise exception '% için miktar sıfırdan büyük olmalı', v_name; end if;
      elsif v_kind = 'note' then
        v_name := trim(coalesce(v_item->>'item_name', ''));
        v_unit := 'SATIR';
        v_qty := 1;
        if char_length(v_name) < 2 then raise exception 'İmalat açıklaması zorunlu'; end if;
      else
        raise exception 'Geçersiz imalat satırı';
      end if;

      insert into public.production_items
        (production_job_id, item_name_snapshot, quantity, unit_snapshot, sort_order, kind, progress_id, stage_log_id, sheet_id)
      values
        (v_job_id, v_name, v_qty, v_unit, coalesce((v_item->>'sort_order')::int, 0), v_kind, v_progress.id, v_log_id, v_sheet_id)
      returning id into v_item_id;

      if v_kind = 'extra' then
        if v_can_price and v_item ? 'unit_price' then
          v_price := nullif(v_item->>'unit_price', '')::numeric;
        else
          v_price := (v_old_prices ->> coalesce(v_item->>'item_id', ''))::numeric;
        end if;
        if v_price is not null then
          if v_price < 0 then raise exception 'Birim fiyat negatif olamaz'; end if;
          insert into public.hakedis_extra_values (production_item_id, company_id, unit_price, amount, updated_by)
          values (v_item_id, v_company, v_price, round(v_qty * v_price, 2), auth.uid());
        end if;
      end if;
    end loop;
  end loop;

  -- Kaldırılan iş kalemi satırlarının iş kayıtları silinir.
  delete from public.project_stage_logs
  where company_id = v_company
    and id in (select (value->>'log')::uuid from jsonb_each(v_old_links))
    and not (id = any (v_kept));

  perform set_config('mk_ops.production_sync', 'off', true);
  return v_entry_id;
end;
$$;

-- 9. Hakediş raporu: pozun türü projeden (gövdenin geri kalanı 20261022000001 ile aynı)
CREATE OR REPLACE FUNCTION public.get_hakedis_report(p_start date, p_end date, p_branch_id uuid DEFAULT NULL::uuid)
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
      join public.projects p on p.id = sp.project_id
      join public.project_types t on t.id = coalesce(st.project_type_id, p.project_type_id)
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

-- 10. Yetkiler ------------------------------------------------------------------------------------
revoke all on function public.ensure_project_poz_row(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refresh_poz_project(uuid) from public, anon, authenticated;
revoke all on function public.hakedis_log_price(uuid, date) from public, anon, authenticated;
revoke all on function public.on_poz_price_change() from public, anon, authenticated;
revoke all on function public.save_project_kesif(uuid, jsonb) from public, anon;
grant execute on function public.save_project_kesif(uuid, jsonb) to authenticated;
