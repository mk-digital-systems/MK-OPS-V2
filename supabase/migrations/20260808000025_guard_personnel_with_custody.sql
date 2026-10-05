-- =============================================================================
-- 00025 — Üzerinde zimmet bulunan personelin pasife alınmasını engelle
-- 00024'ten sonra çalıştırılmalıdır.
-- =============================================================================

create or replace function public.guard_personnel_with_active_custody()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_personnel_id uuid;
  v_custody_count integer;
begin
  if tg_op = 'UPDATE' then
    if old.is_active is not true or new.is_active is true then
      return new;
    end if;
    v_personnel_id := old.id;
  else
    v_personnel_id := old.id;
  end if;

  select count(*)::integer
  into v_custody_count
  from public.inventory_custody_balances
  where holder_type = 'personnel'
    and holder_id = v_personnel_id
    and quantity > 0;

  if v_custody_count > 0 then
    raise exception
      'Personelin üzerinde % adet aktif malzeme zimmeti var. Önce zimmetleri aktarın veya depoya iade edin.',
      v_custody_count
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists personnel_guard_active_custody
  on public.personnel;
create trigger personnel_guard_active_custody
before update of is_active or delete
on public.personnel
for each row execute function public.guard_personnel_with_active_custody();

comment on function public.guard_personnel_with_active_custody() is
  'Aktif zimmeti bulunan personelin pasife alınmasını veya silinmesini engeller.';
