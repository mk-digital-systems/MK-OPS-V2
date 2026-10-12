-- Şube depoları
--
--   1. Yeni şube açılınca "<Şube> Depo" otomatik oluşur (Merkez'in deposu ana depodur).
--   2. Deposu olmayan mevcut şubelere bir kez depo açılır.
--   3. Şube adı değişince otomatik adlı depo da yeniden adlanır.
--   4. Şube silinirken stoğu ve hareket geçmişi olmayan depoları da silinir
--      (geçmişi olan depo şube silmeyi engeller).

-- Ad çakışırsa "Bolu Depo 2" gibi boş bir ad bulur.
create function public.inventory_free_location_name(p_company_id uuid, p_base text)
returns text
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
declare
  v_name text := left(trim(p_base), 80);
  v_n integer := 1;
begin
  while exists (select 1 from public.inventory_locations
                where company_id = p_company_id and lower(trim(name)) = lower(v_name)) loop
    v_n := v_n + 1;
    v_name := left(trim(p_base), 76) || ' ' || v_n;
  end loop;
  return v_name;
end;
$$;

revoke all on function public.inventory_free_location_name(uuid, text) from public, anon, authenticated;

create function public.branches_create_location()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if not new.is_main then
    insert into public.inventory_locations (company_id, name, is_main, sort_order, branch_id)
    values (new.company_id, public.inventory_free_location_name(new.company_id, new.name || ' Depo'), false,
      coalesce((select max(sort_order) + 1 from public.inventory_locations where company_id = new.company_id), 1),
      new.id);
  end if;
  return null;
end;
$$;

create function public.branches_rename_location()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  if new.name is distinct from old.name then
    update public.inventory_locations
    set name = public.inventory_free_location_name(new.company_id, new.name || ' Depo')
    where company_id = new.company_id and branch_id = new.id and not is_main
      and lower(trim(name)) = lower(trim(old.name || ' Depo'));
  end if;
  return null;
end;
$$;

create function public.branches_delete_empty_locations()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  delete from public.inventory_location_stocks s
  using public.inventory_locations l
  where s.location_id = l.id and l.branch_id = old.id and not l.is_main and s.quantity = 0
    and not exists (select 1 from public.inventory_movements m where l.id in (m.source_location_id, m.target_location_id))
    and not exists (select 1 from public.inventory_shipments sh where l.id in (sh.from_location_id, sh.to_location_id));
  delete from public.inventory_locations l
  where l.branch_id = old.id and not l.is_main
    and not exists (select 1 from public.inventory_location_stocks s where s.location_id = l.id)
    and not exists (select 1 from public.inventory_movements m where l.id in (m.source_location_id, m.target_location_id))
    and not exists (select 1 from public.inventory_shipments sh where l.id in (sh.from_location_id, sh.to_location_id));
  return old;
end;
$$;

revoke all on function public.branches_create_location() from public, anon, authenticated;
revoke all on function public.branches_rename_location() from public, anon, authenticated;
revoke all on function public.branches_delete_empty_locations() from public, anon, authenticated;

create trigger branches_create_location
after insert on public.branches
for each row execute function public.branches_create_location();

create trigger branches_rename_location
after update of name on public.branches
for each row execute function public.branches_rename_location();

create trigger branches_delete_empty_locations
before delete on public.branches
for each row execute function public.branches_delete_empty_locations();

-- Deposu olmayan mevcut şubeler
insert into public.inventory_locations (company_id, name, is_main, sort_order, branch_id)
select b.company_id, public.inventory_free_location_name(b.company_id, b.name || ' Depo'), false,
  coalesce((select max(sort_order) + 1 from public.inventory_locations l where l.company_id = b.company_id), 1),
  b.id
from public.branches b
where not b.is_main
  and not exists (select 1 from public.inventory_locations l where l.branch_id = b.id);
