-- =============================================================================
-- MK OPS — hakediş (iş değeri)
--
-- iş_değeri = miktar × birim_fiyat. Ekip/taşeron payı ve onay adımı yoktur;
-- iş kaydı girildiği anda hakedişe sayılır.
--
-- Fiyatlar ayrı tablolarda tutulur; RLS yalnızca "hakediş" yetkisi olanlara
-- (ana yönetici + yetki verilen yönetici/muhasebe) açıktır:
--   * hakedis_stage_prices    aşamanın varsayılan birim fiyatı (proje türü düzeyi)
--   * hakedis_project_prices  projeye/bölüme özel birim fiyat
--   * hakedis_log_values      iş kaydının girildiği andaki fiyatı ve tutarı (sabitlenir)
-- Fiyatı olmayan kayıtlar, fiyat girildiğinde otomatik fiyatlanır; fiyatlanmış
-- kayıtların tutarı sonradan fiyat değişse de değişmez.
-- =============================================================================

-- 1. "Hakediş" modül yetkisi --------------------------------------------------------
alter table public.company_manager_permissions
  add column hakedis_write boolean not null default false;

create or replace function public.has_module_write_permission(p_module text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when public.current_user_role() = 'site_chief' then true
    when public.current_user_role() not in ('company_manager', 'accounting') then false
    else coalesce((
      select case p_module
        when 'projects' then cmp.projects_write
        when 'work_plans' then cmp.work_plans_write
        when 'personnel' then cmp.personnel_write
        when 'attendance' then cmp.attendance_write
        when 'vehicles' then cmp.vehicles_write
        when 'inventory' then cmp.inventory_write
        when 'custody' then cmp.custody_write
        when 'productions' then cmp.productions_write
        when 'hakedis' then cmp.hakedis_write
        else false
      end
      from public.company_manager_permissions cmp
      where cmp.user_id = auth.uid()
    ), false)
  end;
$$;

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
    raise exception 'Bu işlem için ana yönetici yetkisi gerekli' using errcode = '42501';
  end if;
  select role into v_role from public.profiles
  where company_id = public.current_company_id() and id = p_user_id and is_approved = true;
  if v_role not in ('company_manager', 'accounting') then
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

-- 2. Firma ayarları: dönem başlangıç günü ve para birimi ------------------------------
alter table public.companies
  add column payroll_start_day integer not null default 1 check (payroll_start_day between 1 and 28),
  add column currency_code text not null default 'TRY' check (currency_code in ('TRY', 'USD', 'EUR'));

comment on column public.companies.payroll_start_day is 'Hakediş döneminin başladığı gün (1–28); dönem sonraki ayın bir gün öncesinde biter';
comment on column public.companies.currency_code is 'Hakediş tutarlarının para birimi';

create function public.update_company_settings(p_payroll_start_day integer, p_currency_code text)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.current_company_id() is null or not public.is_site_chief() then
    raise exception 'Firma ayarlarını yalnızca ana yönetici değiştirebilir' using errcode = '42501';
  end if;
  update public.companies
  set payroll_start_day = p_payroll_start_day,
      currency_code = upper(trim(p_currency_code))
  where id = public.current_company_id();
end;
$$;

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
      -- Katılım kodunu yalnızca onaylı ana yönetici görür.
      'join_code', case
        when v_profile.role = 'site_chief' and v_profile.is_approved then v_company.join_code
      end
    ) end
  );
end;
$$;

-- 3. Fiyat ve tutar tabloları ----------------------------------------------------------
create table public.hakedis_stage_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  stage_id uuid not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint hakedis_stage_prices_stage_key unique (stage_id),
  constraint hakedis_stage_prices_stage_fkey foreign key (company_id, stage_id)
    references public.project_type_stages (company_id, id) on delete cascade
);

create table public.hakedis_project_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  progress_id uuid not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint hakedis_project_prices_progress_key unique (progress_id),
  constraint hakedis_project_prices_progress_fkey foreign key (company_id, progress_id)
    references public.project_stage_progress (company_id, id) on delete cascade
);

create table public.hakedis_log_values (
  log_id uuid primary key,
  company_id uuid not null default public.current_company_id()
    references public.companies (id) on delete cascade,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  amount numeric(14, 2) not null,
  priced_at timestamptz not null default now(),
  constraint hakedis_log_values_log_fkey foreign key (company_id, log_id)
    references public.project_stage_logs (company_id, id) on delete cascade
);

comment on table public.hakedis_stage_prices is 'Aşamanın varsayılan birim fiyatı';
comment on table public.hakedis_project_prices is 'Proje (veya bölüm) aşamasına özel birim fiyat; varsayılanı ezer';
comment on table public.hakedis_log_values is 'İş kaydının fiyatlandığı andaki birim fiyat ve tutar (sabit)';

create index idx_hakedis_stage_prices_company on public.hakedis_stage_prices (company_id);
create index idx_hakedis_project_prices_company on public.hakedis_project_prices (company_id);
create index idx_hakedis_log_values_company on public.hakedis_log_values (company_id);

do $$
declare
  v_table text;
begin
  foreach v_table in array array['hakedis_stage_prices', 'hakedis_project_prices', 'hakedis_log_values']
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on public.%I from anon', v_table);
    execute format($p$create policy "company_isolation" on public.%I
      as restrictive for all to authenticated
      using (company_id = (select public.current_company_id()))
      with check (company_id = (select public.current_company_id()))$p$, v_table);
    execute format($p$create policy "%s_hakedis_access" on public.%I for all to authenticated
      using ((select public.has_module_write_permission('hakedis')))
      with check ((select public.has_module_write_permission('hakedis')))$p$, v_table, v_table);
    execute format('create trigger a0_enforce_company_scope before insert or update or delete on public.%I
      for each row execute function public.enforce_company_scope()', v_table);
  end loop;
end $$;

-- Tutarlar yalnızca sistem tarafından yazılır.
revoke insert, update, delete on public.hakedis_log_values from authenticated;

-- 4. Fiyatlama ---------------------------------------------------------------------------
-- Bir aşama satırının geçerli birim fiyatı: projeye özel, yoksa aşamanın varsayılanı.
create function public.hakedis_effective_price(p_progress_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(pp.unit_price, sp.unit_price)
  from public.project_stage_progress p
  left join public.hakedis_project_prices pp on pp.progress_id = p.id
  left join public.hakedis_stage_prices sp on sp.stage_id = p.stage_id
  where p.id = p_progress_id;
$$;

-- Fiyatı henüz sabitlenmemiş ve miktarı olan kayıtları geçerli fiyatla fiyatlar.
create function public.hakedis_price_pending_logs(p_progress_ids uuid[])
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
  cross join lateral (select public.hakedis_effective_price(l.progress_id) as value) price
  where l.progress_id = any (p_progress_ids)
    and l.quantity is not null
    and price.value is not null
    and not exists (select 1 from public.hakedis_log_values v where v.log_id = l.id);
end;
$$;

-- Yeni kayıt: girildiği andaki fiyatla sabitlenir. Miktar değişirse tutar,
-- sabitlenmiş birim fiyatla yeniden hesaplanır.
create function public.hakedis_on_log_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if tg_op = 'INSERT' then
    perform public.hakedis_price_pending_logs(array[new.progress_id]);
  elsif new.quantity is distinct from old.quantity then
    if new.quantity is null then
      delete from public.hakedis_log_values where log_id = new.id;
    else
      update public.hakedis_log_values
      set amount = round(new.quantity * unit_price, 2)
      where log_id = new.id;
      perform public.hakedis_price_pending_logs(array[new.progress_id]);
    end if;
  end if;
  return null;
end;
$$;

create trigger project_stage_logs_hakedis
after insert or update of quantity on public.project_stage_logs
for each row execute function public.hakedis_on_log_change();

create function public.hakedis_on_project_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.hakedis_price_pending_logs(array[new.progress_id]);
  return null;
end;
$$;

create trigger hakedis_project_prices_apply
after insert or update on public.hakedis_project_prices
for each row execute function public.hakedis_on_project_price_change();

create function public.hakedis_on_stage_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  perform public.hakedis_price_pending_logs(array(
    select id from public.project_stage_progress where stage_id = new.stage_id
  ));
  return null;
end;
$$;

create trigger hakedis_stage_prices_apply
after insert or update on public.hakedis_stage_prices
for each row execute function public.hakedis_on_stage_price_change();

-- 5. Fiyat kaydetme -------------------------------------------------------------------------
-- p_prices: [{ "stage_id": uuid, "unit_price": number|null }]; null fiyatı kaldırır.
create function public.save_stage_prices(p_prices jsonb)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_item jsonb;
  v_stage_id uuid;
  v_price numeric;
begin
  if public.current_company_id() is null or not public.has_module_write_permission('hakedis') then
    raise exception 'Fiyatları yalnızca hakediş yetkisi olan kullanıcılar düzenleyebilir' using errcode = '42501';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_prices, '[]'::jsonb))
  loop
    v_stage_id := (v_item->>'stage_id')::uuid;
    if not exists (
      select 1 from public.project_type_stages
      where id = v_stage_id and company_id = public.current_company_id()
    ) then
      raise exception 'Aşama bulunamadı';
    end if;
    v_price := nullif(v_item->>'unit_price', '')::numeric;
    if v_price is null then
      delete from public.hakedis_stage_prices where stage_id = v_stage_id;
    elsif v_price < 0 then
      raise exception 'Birim fiyat negatif olamaz';
    else
      insert into public.hakedis_stage_prices (company_id, stage_id, unit_price)
      values (public.current_company_id(), v_stage_id, round(v_price, 2))
      on conflict (stage_id) do update
      set unit_price = excluded.unit_price, updated_at = now(), updated_by = auth.uid();
    end if;
  end loop;
end;
$$;

create function public.set_project_stage_price(p_progress_id uuid, p_unit_price numeric)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if public.current_company_id() is null or not public.has_module_write_permission('hakedis') then
    raise exception 'Fiyatları yalnızca hakediş yetkisi olan kullanıcılar düzenleyebilir' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.project_stage_progress
    where id = p_progress_id and company_id = public.current_company_id()
  ) then
    raise exception 'Aşama bulunamadı';
  end if;
  if p_unit_price is null then
    delete from public.hakedis_project_prices where progress_id = p_progress_id;
  elsif p_unit_price < 0 then
    raise exception 'Birim fiyat negatif olamaz';
  else
    insert into public.hakedis_project_prices (company_id, progress_id, unit_price)
    values (public.current_company_id(), p_progress_id, round(p_unit_price, 2))
    on conflict (progress_id) do update
    set unit_price = excluded.unit_price, updated_at = now(), updated_by = auth.uid();
  end if;
end;
$$;

-- 6. Rapor ------------------------------------------------------------------------------------
-- Tarih aralığındaki iş kayıtlarının hakedişi: toplam, proje, aşama, ekip şefi ve ayrıntı.
create function public.get_hakedis_report(p_start date, p_end date)
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
        l.id, l.log_date, l.quantity, l.team_leader_name, l.notes,
        v.unit_price, v.amount,
        st.id as stage_id, st.name as stage_name, st.unit, st.sort_order,
        t.id as type_id, t.name as type_name,
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
    )
    select jsonb_build_object(
      'start', p_start,
      'end', p_end,
      'total_amount', coalesce((select sum(amount) from report_rows), 0),
      'priced_count', (select count(*) from report_rows where amount is not null),
      'unpriced_count', (select count(*) from report_rows where amount is null),
      'by_project', coalesce((
        select jsonb_agg(x order by x.amount desc nulls last) from (
          select project_id, project_code, project_name, type_name,
                 coalesce(sum(amount), 0) as amount, count(*) filter (where amount is null) as unpriced
          from report_rows group by project_id, project_code, project_name, type_name
        ) x
      ), '[]'::jsonb),
      'by_stage', coalesce((
        select jsonb_agg(x order by x.type_name, x.sort_order) from (
          select type_name, stage_id, stage_name, unit, min(sort_order) as sort_order,
                 sum(quantity) as quantity, coalesce(sum(amount), 0) as amount,
                 count(*) filter (where amount is null) as unpriced
          from report_rows group by type_name, stage_id, stage_name, unit
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
          select id, log_date, project_id, project_code, project_name, section_name,
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

-- Gösterge özeti: bugün, bu hafta (Pazartesi başlangıç) ve aktif hakediş dönemi.
create function public.get_hakedis_summary()
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
    select jsonb_build_object(
      'currency_code', v_company.currency_code,
      'period_start', v_period_start,
      'period_end', v_period_end,
      'today', coalesce(sum(v.amount) filter (where l.log_date = v_today), 0),
      'week', coalesce(sum(v.amount) filter (where l.log_date >= date_trunc('week', v_today)::date and l.log_date <= v_today), 0),
      'period', coalesce(sum(v.amount) filter (where l.log_date between v_period_start and v_period_end), 0),
      'unpriced_in_period', count(*) filter (where v.log_id is null and l.quantity is not null and l.log_date between v_period_start and v_period_end)
    )
    from public.project_stage_logs l
    left join public.hakedis_log_values v on v.log_id = l.id
    where l.company_id = v_company.id
      and l.log_date >= least(v_period_start, date_trunc('week', v_today)::date)
  );
end;
$$;

-- 7. Yetkiler -----------------------------------------------------------------------------------
do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'update_company_settings', 'hakedis_effective_price', 'hakedis_price_pending_logs',
        'hakedis_on_log_change', 'hakedis_on_project_price_change', 'hakedis_on_stage_price_change',
        'save_stage_prices', 'set_project_stage_price', 'get_hakedis_report', 'get_hakedis_summary'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_function);
  end loop;
end $$;

grant execute on function public.update_company_settings(integer, text) to authenticated;
grant execute on function public.save_stage_prices(jsonb) to authenticated;
grant execute on function public.set_project_stage_price(uuid, numeric) to authenticated;
grant execute on function public.get_hakedis_report(date, date) to authenticated;
grant execute on function public.get_hakedis_summary() to authenticated;
