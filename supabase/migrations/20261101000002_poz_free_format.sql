-- Poz kodu serbest biçim: harf/rakam zorunluluğu yok; elle girilir, 3–5 karakter, projede tekil.

alter table public.project_type_stages drop constraint project_type_stages_poz_code_check;
alter table public.project_type_stages
  add constraint project_type_stages_poz_code_check
    check (poz_code is null or (poz_code = trim(poz_code) and char_length(poz_code) between 3 and 5));

comment on column public.project_type_stages.poz_code is 'İsteğe bağlı poz kodu (elle, 3–5 karakter, serbest biçim); projede tekil';

-- Hata mesajları yeni kurala göre; gövdelerin geri kalanı 20261031000001 ile aynı.
create or replace function public.save_project_stages(p_project_id uuid, p_mode text, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project public.projects;
  v_type public.project_types;
  v_item jsonb;
  v_index integer := 0;
  v_stage public.project_type_stages;
  v_stage_id uuid;
  v_keep uuid[] := '{}';
  v_name text;
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
    raise exception 'Arşivdeki veya iptal edilen projenin kalemleri değiştirilemez';
  end if;
  select * into v_type from public.project_types where id = v_project.project_type_id;
  if v_type.screen <> 'standard' then
    raise exception 'Bu projede iş kalemi kullanılmaz';
  end if;
  if p_mode not in ('template', 'custom') then
    raise exception 'Geçersiz kalem modu';
  end if;

  perform set_config('mk_ops.stage_mode_change', 'on', true);

  if p_mode = 'template' then
    select st.name into v_name
    from public.project_stage_logs l
    join public.project_stage_progress sp on sp.id = l.progress_id
    join public.project_type_stages st on st.id = sp.stage_id
    where sp.project_id = p_project_id and st.project_id = p_project_id
    limit 1;
    if v_name is not null then
      raise exception 'İş kaydı girilmiş projeye özel kalem var (%); şablona dönülemez', v_name;
    end if;
    delete from public.project_stages where project_id = p_project_id;
    delete from public.project_type_stages where project_id = p_project_id;
    update public.projects set stage_mode = 'template', updated_by = auth.uid() where id = p_project_id;
    perform public.sync_project_stage_rows(p_project_id);
    perform public.assert_project_stage_list(p_project_id);
    perform public.refresh_project_rollup(p_project_id);
    perform set_config('mk_ops.stage_mode_change', '', true);
    return;
  end if;

  if jsonb_typeof(coalesce(p_items, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'En az bir iş kalemi seçin';
  end if;

  -- Projeye özel kalemlerin ad çakışmasını önlemek için önce geçici ad verilir.
  update public.project_type_stages set name = id::text where project_id = p_project_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_index := v_index + 1;
    v_stage_id := nullif(v_item ->> 'stage_id', '')::uuid;
    if v_stage_id is not null then
      select * into v_stage from public.project_type_stages
      where id = v_stage_id and project_type_id = v_type.id
        and (project_id is null or project_id = p_project_id);
      if not found then
        raise exception '%. kalem bu projenin türüne ait değil', v_index;
      end if;
    end if;

    if v_stage_id is null or v_stage.project_id is not null then
      if char_length(trim(coalesce(v_item ->> 'name', ''))) = 0 then
        raise exception '%. kalemin adı boş olamaz', v_index;
      end if;
      begin
        if v_stage_id is null then
          insert into public.project_type_stages (company_id, project_type_id, project_id, name, unit, poz_code, sort_order)
          values (v_project.company_id, v_type.id, p_project_id, trim(v_item ->> 'name'),
                  nullif(trim(v_item ->> 'unit'), ''), nullif(trim(v_item ->> 'poz_code'), ''), 1000 + v_index)
          returning id into v_stage_id;
        else
          update public.project_type_stages
          set name = trim(v_item ->> 'name'),
              unit = nullif(trim(v_item ->> 'unit'), ''),
              poz_code = nullif(trim(v_item ->> 'poz_code'), ''),
              sort_order = 1000 + v_index
          where id = v_stage_id;
        end if;
      exception
        when unique_violation then
          raise exception 'Aynı adla iki iş kalemi olamaz: %', trim(v_item ->> 'name');
        when check_violation then
          raise exception 'Poz 3–5 karakter olmalı: %', trim(v_item ->> 'poz_code');
      end;
    end if;

    if v_stage_id = any (v_keep) then
      raise exception 'Aynı kalem listede iki kez var';
    end if;
    v_keep := v_keep || v_stage_id;
  end loop;

  select st.name into v_name
  from public.project_stage_logs l
  join public.project_stage_progress sp on sp.id = l.progress_id
  join public.project_type_stages st on st.id = sp.stage_id
  where sp.project_id = p_project_id and not (sp.stage_id = any (v_keep))
  limit 1;
  if v_name is not null then
    raise exception 'İş kaydı girilmiş kalem projeden çıkarılamaz: %', v_name;
  end if;

  delete from public.project_stage_progress where project_id = p_project_id and not (stage_id = any (v_keep));
  delete from public.project_type_stages where project_id = p_project_id and not (id = any (v_keep));
  delete from public.project_stages where project_id = p_project_id;
  insert into public.project_stages (company_id, project_id, stage_id, sort_order)
  select v_project.company_id, p_project_id, x.stage_id, x.ord
  from unnest(v_keep) with ordinality as x(stage_id, ord);

  update public.projects set stage_mode = 'custom', updated_by = auth.uid() where id = p_project_id;
  perform public.sync_project_stage_rows(p_project_id);
  perform public.assert_project_stage_list(p_project_id);
  perform public.refresh_project_rollup(p_project_id);
  perform set_config('mk_ops.stage_mode_change', '', true);
end;
$$;

create or replace function public.save_project_type(
  p_id uuid,
  p_name text,
  p_description text,
  p_has_sections boolean,
  p_section_label text,
  p_color text,
  p_stages jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company_id uuid := public.current_company_id();
  v_type_id uuid := p_id;
  v_stage jsonb;
  v_index integer := 0;
  v_keep uuid[] := '{}';
  v_stage_id uuid;
  v_project_id uuid;
begin
  if v_company_id is null or not public.is_site_chief() then
    raise exception 'Proje türlerini yalnızca firma yöneticisi düzenleyebilir' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_stages, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_stages, '[]'::jsonb)) = 0 then
    raise exception 'En az bir aşama tanımlayın';
  end if;

  begin
    if v_type_id is null then
      insert into public.project_types (company_id, name, description, has_sections, section_label, color)
      values (v_company_id, trim(p_name), nullif(trim(p_description), ''), coalesce(p_has_sections, false),
              coalesce(nullif(trim(p_section_label), ''), 'Bölüm'), nullif(trim(p_color), ''))
      returning id into v_type_id;
    else
      update public.project_types
      set name = trim(p_name),
          description = nullif(trim(p_description), ''),
          has_sections = coalesce(p_has_sections, false),
          section_label = coalesce(nullif(trim(p_section_label), ''), 'Bölüm'),
          color = nullif(trim(p_color), '')
      where id = v_type_id and company_id = v_company_id;
      if not found then
        raise exception 'Proje türü bulunamadı';
      end if;
    end if;
  exception
    when unique_violation then
      raise exception 'Bu adla bir proje türü zaten var';
  end;

  for v_stage in select value from jsonb_array_elements(p_stages)
  loop
    if nullif(v_stage->>'id', '') is not null then
      v_keep := v_keep || (v_stage->>'id')::uuid;
    end if;
  end loop;

  if exists (
    select 1
    from public.project_type_stages st
    join public.project_stage_progress p on p.stage_id = st.id
    join public.project_stage_logs l on l.progress_id = p.id
    where st.project_type_id = v_type_id and st.project_id is null and not (st.id = any (v_keep))
  ) then
    raise exception 'İş kaydı girilmiş bir aşama silinemez';
  end if;

  delete from public.project_type_stages
  where project_type_id = v_type_id and project_id is null and not (id = any (v_keep));

  -- Ad ve poz çakışmasını önlemek için önce geçici değer verilir.
  update public.project_type_stages
  set name = id::text, poz_code = null
  where project_type_id = v_type_id and project_id is null;

  for v_stage in select value from jsonb_array_elements(p_stages)
  loop
    v_index := v_index + 1;
    if char_length(trim(coalesce(v_stage->>'name', ''))) = 0 then
      raise exception '%. aşamanın adı boş olamaz', v_index;
    end if;
    v_stage_id := nullif(v_stage->>'id', '')::uuid;
    begin
      if v_stage_id is null then
        insert into public.project_type_stages (company_id, project_type_id, name, unit, poz_code, sort_order)
        values (v_company_id, v_type_id, trim(v_stage->>'name'), nullif(trim(v_stage->>'unit'), ''),
                nullif(trim(v_stage->>'poz_code'), ''), v_index);
      else
        update public.project_type_stages
        set name = trim(v_stage->>'name'),
            unit = nullif(trim(v_stage->>'unit'), ''),
            poz_code = nullif(trim(v_stage->>'poz_code'), ''),
            sort_order = v_index
        where id = v_stage_id and project_type_id = v_type_id and project_id is null;
        if not found then
          raise exception 'Aşama bulunamadı';
        end if;
      end if;
    exception
      when unique_violation then
        raise exception 'Aynı adla veya aynı pozla iki aşama olamaz: %', trim(v_stage->>'name');
      when check_violation then
        raise exception 'Poz 3–5 karakter olmalı: %', trim(v_stage->>'poz_code');
    end;
  end loop;

  -- Bölüm ayarı değişmiş olabilir: mevcut projelerin satırlarını tamamla; düzenlenmiş projelerde
  -- şablon kalemi projeye özel kalemle çakışmasın.
  for v_project_id in select p.id from public.projects p where p.project_type_id = v_type_id
  loop
    perform public.sync_project_stage_rows(v_project_id);
    perform public.assert_project_stage_list(v_project_id);
    perform public.refresh_project_rollup(v_project_id);
  end loop;

  return v_type_id;
end;
$$;
