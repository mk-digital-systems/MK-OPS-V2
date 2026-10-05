-- =============================================================================
-- 00023 — Ana şantiye şefi hesabını silinmeye ve rol değişimine karşı koru
-- 00022'den sonra çalıştırılmalıdır.
-- =============================================================================

create or replace function public.protect_primary_site_chief()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_site_chief_id constant uuid :=
    '61bd2d56-8ea0-4e22-92d1-246742a8f6b4'::uuid;
begin
  if tg_op = 'DELETE' and old.id = v_site_chief_id then
    raise exception 'Ana şantiye şefi hesabı silinemez'
      using errcode = '42501';
  end if;

  if tg_op in ('INSERT', 'UPDATE')
    and new.role = 'site_chief'
    and new.id <> v_site_chief_id then
    raise exception 'Başka bir kullanıcı şantiye şefi yapılamaz'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.id = v_site_chief_id then
    if new.id <> v_site_chief_id
      or new.role <> 'site_chief'
      or new.is_approved is not true
      or new.approved_at is null
      or new.approved_by is distinct from v_site_chief_id then
      raise exception 'Ana şantiye şefinin rolü ve onayı değiştirilemez'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' and new.id = v_site_chief_id then
    if new.role <> 'site_chief'
      or new.is_approved is not true
      or new.approved_at is null
      or new.approved_by is distinct from v_site_chief_id then
      raise exception 'Ana şantiye şefi yalnız korumalı rol ile oluşturulabilir'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_primary_site_chief
  on public.profiles;
create trigger profiles_protect_primary_site_chief
before insert or update or delete
on public.profiles
for each row execute function public.protect_primary_site_chief();

comment on function public.protect_primary_site_chief() is
  'Ana şantiye şefinin silinmesini, rol/onay değişimini ve ikinci şef atanmasını engeller.';
