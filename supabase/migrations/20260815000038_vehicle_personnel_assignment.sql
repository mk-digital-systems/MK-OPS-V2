-- Araçların aktif kullanıcı/personel ataması.
alter table public.vehicles
  add column if not exists assigned_personnel_id uuid
  references public.personnel(id) on delete set null;

create unique index if not exists vehicles_one_per_personnel_unique
  on public.vehicles(assigned_personnel_id)
  where assigned_personnel_id is not null;

create index if not exists idx_vehicles_assigned_personnel
  on public.vehicles(assigned_personnel_id);

create or replace function public.assign_vehicle_personnel(
  p_vehicle_id uuid,
  p_personnel_id uuid default null
)
returns public.vehicles
language plpgsql security definer
set search_path = public set row_security = off
as $$
declare v_vehicle public.vehicles;
begin
  if not public.has_module_write_permission('vehicles') then
    raise exception 'Araç işlem yetkisi gerekli' using errcode = '42501';
  end if;
  if p_personnel_id is not null and not exists (
    select 1 from public.personnel where id = p_personnel_id and is_active = true
  ) then raise exception 'Aktif personel bulunamadı'; end if;
  update public.vehicles set assigned_personnel_id = p_personnel_id,
    updated_by = auth.uid() where id = p_vehicle_id returning * into v_vehicle;
  if not found then raise exception 'Araç bulunamadı'; end if;
  return v_vehicle;
exception when unique_violation then
  raise exception 'Bu personelin üzerinde zaten başka bir araç var';
end;
$$;

revoke all on function public.assign_vehicle_personnel(uuid,uuid) from public;
grant execute on function public.assign_vehicle_personnel(uuid,uuid) to authenticated;
