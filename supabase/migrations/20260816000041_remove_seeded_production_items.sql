-- İmalat iş kalemleri kullanıcı tarafından tanımlanır; sabit örnekleri kaldırır.
delete from public.production_item_definitions
where created_by is null
  and (name, unit) in (
    ('FOY Kablo Çekimi', 'MT'),
    ('Ek Yapımı', 'ADET'),
    ('Camper Aktarması', 'ADET'),
    ('Krone İşleme', 'DEVRE')
  )
  and not exists (
    select 1 from public.production_items item
    where item.production_item_definition_id = production_item_definitions.id
  );

create or replace function public.limit_production_item_definitions()
returns trigger language plpgsql set search_path = public
as $$
begin
  if (select count(*) from public.production_item_definitions) >= 50 then
    raise exception 'En fazla 50 iş kalemi tanımlanabilir';
  end if;
  return new;
end;
$$;

drop trigger if exists production_item_definitions_limit
  on public.production_item_definitions;
create trigger production_item_definitions_limit
before insert on public.production_item_definitions
for each row execute function public.limit_production_item_definitions();
