-- =============================================================================
-- 00022 — Muhasebe kullanıcı sayısını en fazla 2 ile sınırla
-- 00021'den sonra çalıştırılmalıdır.
-- =============================================================================

create or replace function public.enforce_role_user_limits()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_role_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('azg-role-assignment'));

  if new.is_approved = true and new.role = 'company_manager' then
    select count(*)::integer
    into v_role_count
    from public.profiles
    where role = 'company_manager'
      and is_approved = true
      and id <> new.id;

    if v_role_count >= 3 then
      raise exception 'En fazla 3 şirket yöneticisi atanabilir';
    end if;
  end if;

  if new.is_approved = true and new.role = 'accounting' then
    select count(*)::integer
    into v_role_count
    from public.profiles
    where role = 'accounting'
      and is_approved = true
      and id <> new.id;

    if v_role_count >= 2 then
      raise exception 'En fazla 2 muhasebe kullanıcısı atanabilir';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_enforce_role_user_limits
  on public.profiles;
create trigger profiles_enforce_role_user_limits
before insert or update of role, is_approved
on public.profiles
for each row execute function public.enforce_role_user_limits();

comment on function public.enforce_role_user_limits() is
  'En fazla 3 şirket yöneticisi ve 2 muhasebe kullanıcısı atanmasını sağlar.';
