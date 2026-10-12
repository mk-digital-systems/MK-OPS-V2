-- Projeye göre iş kalemleri ve poz kodu
--
--   * project_type_stages.poz_code  İsteğe bağlı 3–5 karakter (harf, rakam, nokta, tire). Projede tekildir.
--   * project_type_stages.project_id Doluysa kalem yalnızca o projeye aittir (projeye özel kalem).
--   * projects.stage_mode           template (varsayılan, bugünkü davranış): türün şablon kalemlerinin hepsi;
--                                   şablona eklenen kalem projeye de gelir.
--                                   custom: projenin kalem listesi project_stages'tedir (şablondan seçilenler +
--                                   projeye özel kalemler, sıralı); şablona sonradan eklenen kalem gelmez.
--   * save_project_stages()         Projenin kalem listesini kaydeder (iş kaydı olan kalem çıkarılamaz).
--
--   Hakediş fiyatları ve imalatlar kalem kimliğiyle çalıştığı için projeye özel kalemlerde de aynen çalışır.

-- 1. Kalem: poz ve projeye özel kalem -------------------------------------------------------------
alter table public.project_type_stages
  add column poz_code text
    constraint project_type_stages_poz_code_check check (poz_code is null or poz_code ~ '^[0-9A-Za-zÇĞİÖŞÜçğıöşü.-]{3,5}$'),
  add column project_id uuid,
  add constraint project_type_stages_project_fkey foreign key (company_id, project_id)
    references public.projects (company_id, id) on delete cascade;

comment on column public.project_type_stages.poz_code is 'İsteğe bağlı poz kodu (3–5 karakter); projede tekil';
comment on column public.project_type_stages.project_id is 'Doluysa kalem yalnızca bu projeye aittir';

drop index public.project_type_stages_name_unique;
create unique index project_type_stages_name_unique on public.project_type_stages (project_type_id, lower(trim(name)))
  where project_id is null;
create unique index project_type_stages_project_name_unique on public.project_type_stages (project_id, lower(trim(name)))
  where project_id is not null;
create unique index project_type_stages_poz_unique on public.project_type_stages (project_type_id, lower(poz_code))
  where project_id is null and poz_code is not null;
create index idx_project_type_stages_project on public.project_type_stages (project_id) where project_id is not null;

-- 2. Projenin kalem listesi -----------------------------------------------------------------------
alter table public.projects
  add column stage_mode text not null default 'template'
    constraint projects_stage_mode_check check (stage_mode in ('template', 'custom'));

comment on column public.projects.stage_mode is 'template: türün bütün şablon kalemleri; custom: project_stages listesi';

create table public.project_stages (
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  project_id uuid not null,
  stage_id uuid not null,
  sort_order integer not null default 0,
  primary key (project_id, stage_id),
  constraint project_stages_project_fkey foreign key (company_id, project_id)
    references public.projects (company_id, id) on delete cascade,
  constraint project_stages_stage_fkey foreign key (company_id, stage_id)
    references public.project_type_stages (company_id, id) on delete cascade
);
create index idx_project_stages_company_id on public.project_stages (company_id);
create index idx_project_stages_stage on public.project_stages (stage_id);

comment on table public.project_stages is 'Kalemleri projeye göre düzenlenmiş projenin (stage_mode = custom) sıralı kalem listesi';

alter table public.project_stages enable row level security;
revoke all on public.project_stages from anon;
revoke insert, update, delete on public.project_stages from authenticated;
create policy "company_isolation" on public.project_stages
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy branch_isolation on public.project_stages
  as restrictive for all to authenticated
  using (exists (select 1 from public.projects p where p.id = project_id));
create policy "project_stages_select" on public.project_stages for select to authenticated
  using ((select public.can_view_all()) or (select public.has_module_write_permission('projects')));
create trigger a0_enforce_company_scope before insert or update or delete on public.project_stages
for each row execute function public.enforce_company_scope();

-- Projenin geçerli kalemleri (sırasız): düzenlenmişse liste, değilse türün şablon kalemleri.
create function public.project_stage_ids(p_project_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select ps.stage_id
  from public.project_stages ps
  join public.projects p on p.id = ps.project_id
  where ps.project_id = p_project_id and p.stage_mode = 'custom'
  union all
  select st.id
  from public.projects p
  join public.project_type_stages st on st.project_type_id = p.project_type_id and st.project_id is null
  where p.id = p_project_id and p.stage_mode = 'template';
$$;

-- Projede aynı ad veya aynı poz iki kalemde olamaz.
create function public.assert_project_stage_list(p_project_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_value text;
begin
  select min(st.poz_code) into v_value
  from public.project_type_stages st
  where st.id in (select public.project_stage_ids(p_project_id)) and st.poz_code is not null
  group by lower(st.poz_code)
  having count(*) > 1
  limit 1;
  if v_value is not null then
    raise exception 'Aynı poz bir projede iki kalemde kullanılamaz: %', v_value;
  end if;

  select min(trim(st.name)) into v_value
  from public.project_type_stages st
  where st.id in (select public.project_stage_ids(p_project_id))
  group by lower(trim(st.name))
  having count(*) > 1
  limit 1;
  if v_value is not null then
    raise exception 'Aynı adla iki iş kalemi olamaz: %', v_value;
  end if;
end;
$$;

-- 3. Satır oluşturma: projenin kalem listesine göre ----------------------------------------------
create or replace function public.sync_project_stage_rows(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project public.projects;
  v_has_sections boolean;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then return; end if;
  select has_sections into v_has_sections from public.project_types where id = v_project.project_type_id;

  if v_has_sections then
    insert into public.project_stage_progress (company_id, project_id, section_id, stage_id)
    select v_project.company_id, v_project.id, s.id, sl.stage_id
    from public.project_sections s
    cross join public.project_stage_ids(v_project.id) as sl(stage_id)
    where s.project_id = v_project.id
    on conflict do nothing;
  else
    insert into public.project_stage_progress (company_id, project_id, section_id, stage_id)
    select v_project.company_id, v_project.id, null, sl.stage_id
    from public.project_stage_ids(v_project.id) as sl(stage_id)
    on conflict do nothing;
  end if;
end;
$$;

-- Projeye özel kalem eklenince/silinince yalnızca o proje yenilenir.
create or replace function public.on_stage_definition_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_project_id uuid;
  v_scope uuid := coalesce(new.project_id, old.project_id);
begin
  for v_project_id in
    select id from public.projects
    where project_type_id = coalesce(new.project_type_id, old.project_type_id)
      and (v_scope is null or id = v_scope)
  loop
    if tg_op = 'INSERT' then
      perform public.sync_project_stage_rows(v_project_id);
    end if;
    perform public.refresh_project_rollup(v_project_id);
  end loop;
  return null;
end;
$$;

-- 4. Proje: kalem modu yalnızca save_project_stages ile değişir; düzenlenmiş projenin türü değişmez.
create function public.guard_project_stage_mode()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'INSERT' then
    new.stage_mode := 'template';
    return new;
  end if;
  if new.stage_mode is distinct from old.stage_mode
    and coalesce(current_setting('mk_ops.stage_mode_change', true), '') <> 'on' then
    raise exception 'İş kalemi modu yalnızca kalem düzenleme ekranından değişir';
  end if;
  if new.project_type_id is distinct from old.project_type_id and old.stage_mode = 'custom' then
    raise exception 'Kalemleri projeye göre düzenlenmiş projenin türü değiştirilemez';
  end if;
  return new;
end;
$$;

create trigger projects_guard_stage_mode
before insert or update on public.projects
for each row execute function public.guard_project_stage_mode();

-- 5. Projenin kalem listesini kaydetme --------------------------------------------------------------
-- p_mode 'template': şablondaki bütün kalemler (projeye özel kalemler silinir; iş kaydı varsa olmaz).
-- p_mode 'custom', p_items sırasıyla:
--   [{ "stage_id": uuid }]                                    şablon kalemi
--   [{ "stage_id": uuid|null, "name", "unit", "poz_code" }]   projeye özel kalem (null: yeni)
-- Listede olmayan kalemler projeden çıkar; iş kaydı girilmiş kalem çıkarılamaz.
create function public.save_project_stages(p_project_id uuid, p_mode text, p_items jsonb)
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
          raise exception 'Poz 3–5 karakter olmalı (harf, rakam, nokta, tire): %', trim(v_item ->> 'poz_code');
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

-- 6. Tür kaydetme: poz kodu; projeye özel kalemlere dokunulmaz ------------------------------------
-- p_stages: [{ "id": uuid|null, "name": text, "unit": text|null, "poz_code": text|null }, ...] sırasıyla.
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
        raise exception 'Poz 3–5 karakter olmalı (harf, rakam, nokta, tire): %', trim(v_stage->>'poz_code');
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

-- 7. Yetkiler -------------------------------------------------------------------------------------
revoke all on function public.project_stage_ids(uuid) from public, anon, authenticated;
revoke all on function public.assert_project_stage_list(uuid) from public, anon, authenticated;
revoke all on function public.guard_project_stage_mode() from public, anon, authenticated;
revoke all on function public.save_project_stages(uuid, text, jsonb) from public, anon;
grant execute on function public.save_project_stages(uuid, text, jsonb) to authenticated;
