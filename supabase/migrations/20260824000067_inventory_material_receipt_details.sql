-- Yeni malzemenin ilk kabulünde tarih, teslim alan ve irsaliye bilgisini saklar.
alter table public.inventory_movements
  add column if not exists receipt_date date,
  add column if not exists received_by text,
  add column if not exists dispatch_number text;

drop function if exists public.create_inventory_material(text,text,public.inventory_unit,numeric,text,text);

create or replace function public.create_inventory_material(
  p_material_name text,
  p_material_code text,
  p_unit public.inventory_unit,
  p_initial_quantity numeric,
  p_stock_category text,
  p_receipt_date date,
  p_received_by text,
  p_dispatch_number text,
  p_notes text default null
)
returns public.inventory_materials
language plpgsql security definer
set search_path=public set row_security=off
as $$
declare v_material public.inventory_materials;
begin
  if not public.has_module_write_permission('inventory') then raise exception 'Malzeme stok işlem yetkisi gerekli' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_material_name,'')))<2 then raise exception 'Malzeme cinsi zorunlu'; end if;
  if p_stock_category not in ('fiber_accessory','fiber_cable','copper_network') then raise exception 'Malzeme kategorisi zorunlu'; end if;
  if p_initial_quantity is null or p_initial_quantity<=0 then raise exception 'Başlangıç miktarı sıfırdan büyük olmalıdır'; end if;
  if p_unit='piece' and p_initial_quantity<>trunc(p_initial_quantity) then raise exception 'Adet miktarı tam sayı olmalıdır'; end if;
  if p_receipt_date is null then raise exception 'Giriş tarihi zorunlu'; end if;
  if char_length(trim(coalesce(p_received_by,'')))<2 then raise exception 'Teslim alan zorunlu'; end if;
  if char_length(trim(coalesce(p_dispatch_number,'')))<1 then raise exception 'İrsaliye numarası zorunlu'; end if;

  insert into public.inventory_materials(material_code,material_name,unit,stock_quantity,stock_category,notes,created_by,updated_by)
  values(nullif(trim(p_material_code),''),trim(p_material_name),p_unit,p_initial_quantity,p_stock_category,nullif(trim(p_notes),''),auth.uid(),auth.uid()) returning * into v_material;
  insert into public.inventory_movements(material_id,movement_type,quantity,description,balance_after,created_by,action_type,target_location,receipt_date,received_by,dispatch_number)
  values(v_material.id,'in',p_initial_quantity,'İlk stok girişi',p_initial_quantity,auth.uid(),'in','center',p_receipt_date,trim(p_received_by),trim(p_dispatch_number));
  return v_material;
end;
$$;

revoke all on function public.create_inventory_material(text,text,public.inventory_unit,numeric,text,date,text,text,text) from public;
grant execute on function public.create_inventory_material(text,text,public.inventory_unit,numeric,text,date,text,text,text) to authenticated;
