-- =============================================================================
-- MK OPS — kullanılmayan imalat kalemi tanımlarının kaldırılması
--
-- İmalat satırları artık projenin iş kalemlerine (proje türü aşamaları) veya ek işe
-- bağlanıyor; eski "imalat kalemi tanımları" (production_item_definitions) tablosunu
-- hiçbir ekran kullanmıyor. Kaydetme fonksiyonu bu sütun olmadan yeniden tanımlanır,
-- ardından sütun, tablo ve tablonun tetikleyici fonksiyonu kaldırılır.
-- =============================================================================

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
      v_progress := null;

      if v_kind = 'stage' then
        if v_project.id is null then raise exception 'İş kalemi seçmek için listeden proje seçin'; end if;
        select * into v_progress from public.project_stage_progress
        where company_id = v_company and id = nullif(v_item->>'progress_id', '')::uuid and project_id = v_project.id;
        if v_progress.id is null then raise exception 'Seçilen iş kalemi bu projeye ait değil'; end if;
        select * into v_stage from public.project_type_stages where id = v_progress.stage_id;
        if v_stage.unit is null then raise exception '% iş kaleminin birimi yok; metraj girilemez', v_stage.name; end if;
        if v_qty is null or v_qty <= 0 then raise exception '% için miktar sıfırdan büyük olmalı', v_stage.name; end if;
        select name into v_section_name from public.project_sections where id = v_progress.section_id;
        v_name := concat_ws(' · ', v_section_name, v_stage.name);
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
        (production_job_id, item_name_snapshot, quantity, unit_snapshot, sort_order, kind, progress_id, stage_log_id)
      values
        (v_job_id, v_name, v_qty, v_unit, coalesce((v_item->>'sort_order')::int, 0), v_kind, v_progress.id, v_log_id)
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

alter table public.production_items drop column if exists production_item_definition_id;
drop table if exists public.production_item_definitions;
drop function if exists public.limit_production_item_definitions();
