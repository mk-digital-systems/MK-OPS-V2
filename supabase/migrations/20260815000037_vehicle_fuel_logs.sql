-- Araç yakıt alımı ve kilometre takip kayıtları.
create table if not exists public.vehicle_fuel_logs (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  fuel_date date not null default current_date,
  odometer_km bigint not null check (odometer_km >= 0),
  liters numeric(10,3) not null check (liters > 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vehicle_fuel_logs_vehicle_date
  on public.vehicle_fuel_logs(vehicle_id, fuel_date desc, created_at desc);

alter table public.vehicle_fuel_logs enable row level security;
grant select on public.vehicle_fuel_logs to authenticated;

create policy "vehicle_fuel_logs_select_role_based"
  on public.vehicle_fuel_logs for select to authenticated
  using (public.can_view_all());

create or replace function public.record_vehicle_fuel_purchase(
  p_vehicle_id uuid,
  p_fuel_date date,
  p_odometer_km bigint,
  p_liters numeric,
  p_notes text default null
)
returns public.vehicle_fuel_logs
language plpgsql security definer
set search_path = public set row_security = off
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

  select * into v_vehicle from public.vehicles where id = p_vehicle_id for update;
  if not found then raise exception 'Araç bulunamadı'; end if;
  select max(odometer_km) into v_latest_km from public.vehicle_fuel_logs where vehicle_id = p_vehicle_id;
  v_latest_km := greatest(v_vehicle.current_km, coalesce(v_latest_km, 0));
  if p_odometer_km < v_latest_km then
    raise exception 'Yeni kilometre mevcut kilometreden düşük olamaz. Mevcut: % km', v_latest_km;
  end if;

  insert into public.vehicle_fuel_logs(vehicle_id, fuel_date, odometer_km, liters, notes, created_by)
  values (p_vehicle_id, p_fuel_date, p_odometer_km, p_liters, nullif(trim(p_notes),''), auth.uid())
  returning * into v_log;
  update public.vehicles set current_km = greatest(current_km, p_odometer_km), updated_by = auth.uid()
  where id = p_vehicle_id;
  return v_log;
end;
$$;

revoke all on function public.record_vehicle_fuel_purchase(uuid,date,bigint,numeric,text) from public;
grant execute on function public.record_vehicle_fuel_purchase(uuid,date,bigint,numeric,text) to authenticated;
