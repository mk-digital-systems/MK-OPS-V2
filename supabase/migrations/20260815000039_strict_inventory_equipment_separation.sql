-- Stok ve araç ekipmanı kayıtlarını kesin olarak ayırır.
-- Daha önce zimmet sisteminde kullanılmış malzemeler araç ekipmanı kabul edilir.
update public.inventory_materials material
set material_category = 'equipment'
where material.material_category = 'stock'
  and exists (
    select 1
    from public.inventory_custody_balances balance
    where balance.material_id = material.id
  );

create index if not exists idx_inventory_materials_category_name
  on public.inventory_materials(material_category, material_name);

create or replace function public.guard_material_category_flow()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_category text;
begin
  select material_category into v_category
  from public.inventory_materials where id = new.material_id;

  if tg_table_name in ('inventory_custody_balances', 'inventory_custody_movements')
    and v_category <> 'equipment' then
    raise exception 'Saha stok malzemesi araç ekipmanı zimmetine eklenemez';
  end if;
  return new;
end;
$$;

drop trigger if exists custody_balances_category_guard
  on public.inventory_custody_balances;
create trigger custody_balances_category_guard
before insert or update on public.inventory_custody_balances
for each row execute function public.guard_material_category_flow();

drop trigger if exists custody_movements_category_guard
  on public.inventory_custody_movements;
create trigger custody_movements_category_guard
before insert or update on public.inventory_custody_movements
for each row execute function public.guard_material_category_flow();

comment on column public.inventory_materials.material_category is
  'stock: kablo, direk, beton kaide, kutu gibi saha sarfları; equipment: araç/depo el aleti ve ekipmanları';
