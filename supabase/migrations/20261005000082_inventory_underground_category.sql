-- Stok kategorilerine "Yeraltı Malzeme" (underground) ekler.
do $$
declare r record;
begin
  -- stock_category kontrol kısıtlarını yeni kategoriyi kapsayacak şekilde yeniler.
  for r in
    select c.conrelid::regclass as tbl, c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype='c'
      and c.conrelid in ('public.inventory_materials'::regclass,'public.inventory_catalog'::regclass)
      and pg_get_constraintdef(c.oid) like '%copper_network%'
      and pg_get_constraintdef(c.oid) not like '%underground%'
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
    execute format('alter table %s add constraint %I %s', r.tbl, r.conname,
      replace(r.def, '''copper_network''::text', '''copper_network''::text, ''underground''::text'));
  end loop;

  -- Kategori listesini sabit kontrol eden fonksiyonlara yeni kategoriyi ekler.
  for r in
    select p.oid
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prosrc like '%''copper_network''%'
      and p.prosrc not like '%''underground''%'
  loop
    execute replace(pg_get_functiondef(r.oid), '''copper_network''', '''copper_network'',''underground''');
  end loop;
end;
$$;
