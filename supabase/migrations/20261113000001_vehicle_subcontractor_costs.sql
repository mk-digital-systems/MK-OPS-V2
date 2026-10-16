-- Araç kirası ve yakıtı taşeron hesabına
--
--   * Araca aylık kira girilir (vehicles.monthly_rent). Araç taşeronun kendisine ya da taşeronun herhangi bir personeline
--     (ekip başı dahil) atanmışsa, her ay bittikten sonra kira atalı kaldığı gün oranıyla taşeronun hesabına kesinti olarak
--     yazılır (charge_vehicle_rent; taşeron ekranları açılırken çağrılır, aynı ay iki kez yazılmaz).
--   * Yakıt litre + litre fiyatı olarak girilir. Yakıt verildiği gün araç bir taşeron personelindeyse tutar o anda
--     taşeronun hesabına kesinti olarak yazılır; yakıt kaydı değişir ya da silinirse kesinti de düzelir.
--   * Atamalar vehicle_assignment_history'de tutulur (hangi gün kimdeydi).
--   * Araçtan doğan kesintiler (kaynak: yakıt / kira) taşeron ekstresinde "Araç yakıtı" / "Araç kirası" kategorisinde
--     görünür; elle değiştirilemez, araç kaydı düzeltilir.

-- 1. Alanlar ----------------------------------------------------------------------------------------------

alter table public.vehicles
  add column monthly_rent numeric(12, 2) not null default 0 check (monthly_rent >= 0),
  add column rent_from date;
comment on column public.vehicles.monthly_rent is 'Aylık araç kirası; taşeron personeline atalı gün oranıyla taşeronun hesabına yazılır';
comment on column public.vehicles.rent_from is 'Kiranın hesaplanmaya başladığı gün (kira girildiği gün)';

alter table public.vehicle_fuel_logs
  add column unit_price numeric(10, 2) check (unit_price is null or unit_price > 0);
comment on column public.vehicle_fuel_logs.unit_price is 'Litre fiyatı; araç taşerondaysa litre × fiyat taşeronun hesabına yazılır';

alter table public.subcontractor_expense_categories add column is_system boolean not null default false;

create or replace function public.limit_subcontractor_categories()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.is_system then
    return new;
  end if;
  if (select count(*) from public.subcontractor_expense_categories
      where company_id = new.company_id and not is_system) >= 10 then
    raise exception 'En fazla 10 harcama/ödeme kategorisi tanımlanabilir';
  end if;
  return new;
end;
$$;

alter table public.subcontractor_transactions
  add column source text not null default 'manual' check (source in ('manual', 'fuel', 'rent')),
  add column fuel_log_id uuid references public.vehicle_fuel_logs (id) on delete cascade,
  add column vehicle_id uuid references public.vehicles (id) on delete set null,
  add column rent_month date;

create unique index subcontractor_transactions_fuel_log on public.subcontractor_transactions (fuel_log_id)
  where fuel_log_id is not null;
create unique index subcontractor_transactions_rent on public.subcontractor_transactions (vehicle_id, subcontractor_id, rent_month)
  where source = 'rent';

-- 2. Atama geçmişi ----------------------------------------------------------------------------------------

create table public.vehicle_assignment_history (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  personnel_id uuid not null references public.personnel (id) on delete cascade,
  start_date date not null,
  end_date date,
  constraint vehicle_assignment_history_dates check (end_date is null or end_date >= start_date)
);
create index idx_vehicle_assignment_history_vehicle on public.vehicle_assignment_history (vehicle_id, start_date);
alter table public.vehicle_assignment_history enable row level security;
revoke all on public.vehicle_assignment_history from anon, authenticated;

comment on table public.vehicle_assignment_history is 'Araç hangi personelde hangi günlerde (yalnızca fonksiyonlarla okunur/yazılır)';

insert into public.vehicle_assignment_history (company_id, vehicle_id, personnel_id, start_date)
select v.company_id, v.id, v.assigned_personnel_id, v.created_at::date
from public.vehicles v
where v.assigned_personnel_id is not null;

create function public.vehicles_track_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_today date := timezone('Europe/Istanbul', now())::date;
begin
  if tg_op = 'UPDATE' and new.assigned_personnel_id is not distinct from old.assigned_personnel_id then
    return null;
  end if;
  -- Bugün başlayan atama iptal sayılır; önceki günlerden açık kalan dünden kapanır.
  delete from public.vehicle_assignment_history
  where vehicle_id = new.id and end_date is null and start_date >= v_today;
  update public.vehicle_assignment_history set end_date = v_today - 1
  where vehicle_id = new.id and end_date is null;
  if new.assigned_personnel_id is not null then
    insert into public.vehicle_assignment_history (company_id, vehicle_id, personnel_id, start_date)
    values (new.company_id, new.id, new.assigned_personnel_id, v_today);
  end if;
  return null;
end;
$$;
revoke all on function public.vehicles_track_assignment() from public, anon, authenticated;

create trigger vehicles_track_assignment
after insert or update of assigned_personnel_id on public.vehicles
for each row execute function public.vehicles_track_assignment();

-- Kira girildiği gün hesap başlar.
create function public.vehicles_set_rent_from()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.monthly_rent > 0 and (tg_op = 'INSERT' or old.monthly_rent = 0 or new.rent_from is null) then
    new.rent_from := timezone('Europe/Istanbul', now())::date;
  elsif new.monthly_rent = 0 then
    new.rent_from := null;
  end if;
  return new;
end;
$$;

create trigger vehicles_set_rent_from
before insert or update of monthly_rent on public.vehicles
for each row execute function public.vehicles_set_rent_from();

-- 3. Taşeron kategorileri ve araçtan doğan kayıtların koruması -----------------------------------------

create function public.subcontractor_system_category(p_company_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.subcontractor_expense_categories
  where company_id = p_company_id and lower(trim(name)) = lower(p_name);
  if v_id is null then
    insert into public.subcontractor_expense_categories (company_id, name, sort_order, is_system)
    values (p_company_id, p_name, 90, true)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.subcontractor_system_category(uuid, text) from public, anon, authenticated;

create function public.guard_vehicle_cost_transactions()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if public.is_tenant_request()
    and pg_trigger_depth() <= 1
    and coalesce(current_setting('mk_ops.vehicle_cost_sync', true), '') <> 'on'
    and ((tg_op <> 'INSERT' and old.source <> 'manual') or (tg_op <> 'DELETE' and new.source <> 'manual')) then
    raise exception 'Araç yakıtı ve kirası araç kaydından oluşur; araç kaydını düzeltin' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger a1_guard_vehicle_cost_transactions
before insert or update or delete on public.subcontractor_transactions
for each row execute function public.guard_vehicle_cost_transactions();

-- 4. Aracın o gün bağlı olduğu taşeron ---------------------------------------------------------------

create function public.vehicle_holder_subcontractor(p_vehicle_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select p.subcontractor_id
  from public.vehicle_assignment_history h
  join public.personnel p on p.id = h.personnel_id
  where h.vehicle_id = p_vehicle_id
    and h.start_date <= p_date
    and (h.end_date is null or h.end_date >= p_date)
  order by h.start_date desc
  limit 1;
$$;
revoke all on function public.vehicle_holder_subcontractor(uuid, date) from public, anon, authenticated;

-- 5. Yakıt → taşeron hesabı ----------------------------------------------------------------------------

create function public.sync_fuel_subcontractor_cost()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_sub uuid;
  v_plate text;
  v_amount numeric;
begin
  perform set_config('mk_ops.vehicle_cost_sync', 'on', true);
  v_sub := public.vehicle_holder_subcontractor(new.vehicle_id, new.fuel_date);
  v_amount := round(new.liters * coalesce(new.unit_price, 0), 2);
  if v_sub is null or new.unit_price is null or v_amount <= 0 then
    delete from public.subcontractor_transactions where fuel_log_id = new.id;
  else
    select plate into v_plate from public.vehicles where id = new.vehicle_id;
    insert into public.subcontractor_transactions
      (company_id, subcontractor_id, category_id, transaction_date, amount, notes, source, fuel_log_id, vehicle_id)
    values (new.company_id, v_sub, public.subcontractor_system_category(new.company_id, 'Araç yakıtı'), new.fuel_date, v_amount,
      v_plate || ' · ' || trim(to_char(new.liters, 'FM999999990.###')) || ' lt × ' || trim(to_char(new.unit_price, 'FM999999990.00')),
      'fuel', new.id, new.vehicle_id)
    on conflict (fuel_log_id) where fuel_log_id is not null
    do update set subcontractor_id = excluded.subcontractor_id, amount = excluded.amount,
      transaction_date = excluded.transaction_date, notes = excluded.notes;
  end if;
  perform set_config('mk_ops.vehicle_cost_sync', 'off', true);
  return null;
end;
$$;
revoke all on function public.sync_fuel_subcontractor_cost() from public, anon, authenticated;

create trigger sync_fuel_subcontractor_cost
after insert or update of liters, unit_price, fuel_date, vehicle_id on public.vehicle_fuel_logs
for each row execute function public.sync_fuel_subcontractor_cost();

-- Yakıt kaydı: litre fiyatı da girilir.
drop function public.record_vehicle_fuel_purchase(uuid, date, bigint, numeric, text, uuid);
create function public.record_vehicle_fuel_purchase(p_vehicle_id uuid, p_fuel_date date, p_odometer_km bigint, p_liters numeric,
  p_notes text default null, p_branch_id uuid default null, p_unit_price numeric default null)
returns public.vehicle_fuel_logs
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_vehicle public.vehicles;
  v_latest_km bigint;
  v_log public.vehicle_fuel_logs;
begin
  if not public.has_module_write_permission('vehicles') then
    raise exception 'Araç işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_fuel_date is null or p_fuel_date > current_date then
    raise exception 'Yakıt tarihi geçersiz';
  end if;
  if p_liters is null or p_liters <= 0 then raise exception 'Litre sıfırdan büyük olmalıdır'; end if;
  if p_unit_price is not null and p_unit_price <= 0 then raise exception 'Litre fiyatı sıfırdan büyük olmalıdır'; end if;

  select * into v_vehicle from public.vehicles where company_id = public.current_company_id() and id = p_vehicle_id for update;
  if not found then raise exception 'Araç bulunamadı'; end if;
  select max(odometer_km) into v_latest_km from public.vehicle_fuel_logs
  where company_id = public.current_company_id() and vehicle_id = p_vehicle_id;
  v_latest_km := greatest(v_vehicle.current_km, coalesce(v_latest_km, 0));
  if p_odometer_km < v_latest_km then
    raise exception 'Yeni kilometre mevcut kilometreden düşük olamaz. Mevcut: % km', v_latest_km;
  end if;

  insert into public.vehicle_fuel_logs (vehicle_id, fuel_date, odometer_km, liters, unit_price, notes, created_by, branch_id)
  values (p_vehicle_id, p_fuel_date, p_odometer_km, p_liters, p_unit_price, nullif(trim(p_notes), ''), auth.uid(), p_branch_id)
  returning * into v_log;
  update public.vehicles set current_km = greatest(current_km, p_odometer_km), updated_by = auth.uid()
  where id = p_vehicle_id;
  return v_log;
end;
$$;

revoke all on function public.record_vehicle_fuel_purchase(uuid, date, bigint, numeric, text, uuid, numeric) from public, anon;
grant execute on function public.record_vehicle_fuel_purchase(uuid, date, bigint, numeric, text, uuid, numeric) to authenticated;

-- 6. Kira → taşeron hesabı (biten aylar, atalı gün oranıyla) --------------------------------------------

create function public.charge_vehicle_rent()
returns integer
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_company uuid := public.current_company_id();
  v_today date := timezone('Europe/Istanbul', now())::date;
  v_first date;
  v_last date;
  v_row record;
  v_count integer := 0;
  v_rows integer;
begin
  if v_company is null or not (public.has_module_write_permission('hakedis') or public.has_module_write_permission('vehicles')) then
    raise exception 'Yetkiniz yok' using errcode = '42501';
  end if;

  select date_trunc('month', min(v.rent_from))::date into v_first
  from public.vehicles v where v.company_id = v_company and v.monthly_rent > 0 and v.rent_from is not null;
  v_last := (date_trunc('month', v_today) - interval '1 month')::date;
  if v_first is null or v_first > v_last then
    return 0;
  end if;

  perform set_config('mk_ops.vehicle_cost_sync', 'on', true);
  for v_row in
    with months as (
      select (v_first + make_interval(months => i))::date as m
      from generate_series(0, (extract(year from v_last) * 12 + extract(month from v_last)
                              - extract(year from v_first) * 12 - extract(month from v_first))::integer) i
    )
    select v.id as vehicle_id, v.plate, v.monthly_rent, p.subcontractor_id as sub, m.m as month_start,
      (m.m + interval '1 month - 1 day')::date as month_end,
      extract(day from (m.m + interval '1 month - 1 day'))::integer as days_in_month,
      sum(greatest(0,
        least(coalesce(h.end_date, date '9999-12-31'), (m.m + interval '1 month - 1 day')::date)
        - greatest(h.start_date, m.m, v.rent_from) + 1)) as days
    from public.vehicles v
    join public.vehicle_assignment_history h on h.vehicle_id = v.id
    join public.personnel p on p.id = h.personnel_id
    join months m on true
    where v.company_id = v_company and v.monthly_rent > 0 and v.rent_from is not null
      and p.subcontractor_id is not null
    group by v.id, v.plate, v.monthly_rent, p.subcontractor_id, m.m
    having sum(greatest(0,
        least(coalesce(h.end_date, date '9999-12-31'), (m.m + interval '1 month - 1 day')::date)
        - greatest(h.start_date, m.m, v.rent_from) + 1)) > 0
  loop
    insert into public.subcontractor_transactions
      (company_id, subcontractor_id, category_id, transaction_date, amount, notes, source, vehicle_id, rent_month)
    values (v_company, v_row.sub, public.subcontractor_system_category(v_company, 'Araç kirası'), v_row.month_end,
      round(v_row.monthly_rent * v_row.days / v_row.days_in_month, 2),
      v_row.plate || ' · ' || to_char(v_row.month_start, 'MM.YYYY') || ' kirası (' || v_row.days || '/' || v_row.days_in_month || ' gün)',
      'rent', v_row.vehicle_id, v_row.month_start)
    on conflict (vehicle_id, subcontractor_id, rent_month) where source = 'rent' do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  perform set_config('mk_ops.vehicle_cost_sync', 'off', true);
  return v_count;
end;
$$;

revoke all on function public.charge_vehicle_rent() from public, anon;
grant execute on function public.charge_vehicle_rent() to authenticated;
