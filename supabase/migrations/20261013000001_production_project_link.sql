-- =============================================================================
-- MK OPS — imalatların projeye ve hakedişe bağlanması
--
-- İmalat satırı üç türdür (production_items.kind):
-- * stage : projenin iş kalemi (proje türü aşaması) + miktar. Kaydedilince projeye
--           kaynağı "production" olan bir iş kaydı (project_stage_logs) açılır; ilerleme ve
--           hakediş (aşama fiyatıyla, kayıt anında sabitlenir) kendiliğinden güncellenir.
-- * extra : listede olmayan iş (ek iş): açıklama + miktar + birim; birim fiyatı
--           hakedis_extra_values'ta (yalnızca hakediş yetkilileri görür/girer). Hakedişe dahildir.
-- * note  : bu sürümden önceki serbest metin satırları; hakedişe dahil değildir.
--
-- İmalattan gelen iş kayıtları projeden elle değiştirilemez/silinemez; imalat
-- düzenlenince güncellenir (fiyat sabitlemesi korunur), silinince silinir.
-- =============================================================================

-- 1. Kolonlar ------------------------------------------------------------------------------
alter table public.project_stage_logs
  add column source text not null default 'manual' check (source in ('manual', 'production'));

alter table public.production_items
  add column kind text not null default 'note' check (kind in ('stage', 'extra', 'note')),
  add column progress_id uuid,
  add column stage_log_id uuid;

alter table public.production_items
  add constraint production_items_progress_fkey
  foreign key (company_id, progress_id) references public.project_stage_progress (company_id, id)
  on delete set null (progress_id);
alter table public.production_items
  add constraint production_items_stage_log_fkey
  foreign key (company_id, stage_log_id) references public.project_stage_logs (company_id, id)
  on delete set null (stage_log_id);
create index idx_production_items_stage_log on public.production_items (stage_log_id);

comment on column public.production_items.kind is 'stage: projenin iş kalemi; extra: fiyatlı ek iş; note: eski serbest metin';
comment on column public.project_stage_logs.source is 'manual: proje detayından; production: İmalatlar''dan otomatik';

-- 2. Ek iş fiyatları (hakediş yetkisiyle korunur) ---------------------------------------------
create table public.hakedis_extra_values (
  production_item_id uuid primary key references public.production_items (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  unit_price numeric(12,2) not null check (unit_price >= 0),
  amount numeric(14,2) not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.hakedis_extra_values is 'İmalattaki ek işlerin (kind = extra) birim fiyatı ve tutarı';

alter table public.hakedis_extra_values enable row level security;
revoke all on public.hakedis_extra_values from anon, authenticated;
grant select on public.hakedis_extra_values to authenticated;
create policy "company_isolation" on public.hakedis_extra_values
  as restrictive for all to authenticated
  using (company_id = (select public.current_company_id()))
  with check (company_id = (select public.current_company_id()));
create policy "hakedis_extra_values_select" on public.hakedis_extra_values
  for select to authenticated using (public.has_module_write_permission('hakedis'));

-- 3. İmalattan gelen iş kayıtlarını koru -------------------------------------------------------
create function public.guard_production_stage_logs()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if old.source <> 'production' or coalesce(current_setting('mk_ops.production_sync', true), '') = 'on' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    -- Proje/aşama silinirken zincirleme silme serbest.
    if not exists (select 1 from public.project_stage_progress where id = old.progress_id) then
      return old;
    end if;
    raise exception 'Bu iş kaydı İmalatlar''dan geldi; silmek için ilgili imalat kaydını düzenleyin' using errcode = '42501';
  end if;
  if new.quantity is distinct from old.quantity
    or new.log_date is distinct from old.log_date
    or new.progress_id is distinct from old.progress_id then
    raise exception 'Bu iş kaydı İmalatlar''dan geldi; değiştirmek için ilgili imalat kaydını düzenleyin' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger a1_guard_production_stage_logs
before update or delete on public.project_stage_logs
for each row execute function public.guard_production_stage_logs();

-- 4. İmalat kaydetme ---------------------------------------------------------------------------
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
        (production_job_id, production_item_definition_id, item_name_snapshot, quantity, unit_snapshot, sort_order, kind, progress_id, stage_log_id)
      values
        (v_job_id, null, v_name, v_qty, v_unit, coalesce((v_item->>'sort_order')::int, 0), v_kind, v_progress.id, v_log_id)
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

create or replace function public.delete_production_entry(p_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_logs uuid[];
begin
  if not public.has_module_write_permission('productions') then
    raise exception 'İmalat silme yetkisi gerekli' using errcode = '42501';
  end if;
  select array_agg(i.stage_log_id) into v_logs
  from public.production_items i
  join public.production_jobs j on j.id = i.production_job_id
  join public.production_entries e on e.id = j.production_entry_id
  where e.company_id = public.current_company_id() and e.id = p_entry_id and i.stage_log_id is not null;

  perform set_config('mk_ops.production_sync', 'on', true);
  delete from public.production_entries where company_id = public.current_company_id() and id = p_entry_id;
  delete from public.project_stage_logs where company_id = public.current_company_id() and id = any (coalesce(v_logs, '{}'));
  perform set_config('mk_ops.production_sync', 'off', true);
end;
$$;

-- 5. Ek iş fiyatı (Hakediş sayfasından) -----------------------------------------------------------
create function public.set_production_extra_price(p_item_id uuid, p_unit_price numeric)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_item public.production_items;
begin
  if public.current_company_id() is null or not public.has_module_write_permission('hakedis') then
    raise exception 'Fiyat girmek için hakediş yetkisi gerekli' using errcode = '42501';
  end if;
  select * into v_item from public.production_items
  where id = p_item_id and company_id = public.current_company_id() and kind = 'extra';
  if v_item.id is null then raise exception 'Ek iş bulunamadı'; end if;
  if p_unit_price is null then
    delete from public.hakedis_extra_values where production_item_id = p_item_id;
    return;
  end if;
  if p_unit_price < 0 then raise exception 'Birim fiyat negatif olamaz'; end if;
  insert into public.hakedis_extra_values (production_item_id, company_id, unit_price, amount, updated_by)
  values (p_item_id, v_item.company_id, p_unit_price, round(v_item.quantity * p_unit_price, 2), auth.uid())
  on conflict (production_item_id) do update set
    unit_price = excluded.unit_price, amount = excluded.amount, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- 6. Hakediş raporu ve özeti: ek işler dahil -------------------------------------------------------
create or replace function public.get_hakedis_report(p_start date, p_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
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
$$;

create or replace function public.get_hakedis_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
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
      left join public.hakedis_log_values v on v.log_id = l.id
      where l.company_id = v_company.id and l.quantity is not null
        and l.log_date >= least(v_period_start, date_trunc('week', v_today)::date)
      union all
      select e.work_date, x.amount
      from public.production_items i
      join public.production_jobs j on j.id = i.production_job_id
      join public.production_entries e on e.id = j.production_entry_id
      left join public.hakedis_extra_values x on x.production_item_id = i.id
      where i.company_id = v_company.id and i.kind = 'extra'
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
$$;

-- 7. Yetkiler -----------------------------------------------------------------------------------
revoke execute on function public.guard_production_stage_logs() from public, anon, authenticated;
revoke execute on function public.set_production_extra_price(uuid, numeric) from public, anon, authenticated;
grant execute on function public.set_production_extra_price(uuid, numeric) to authenticated;
