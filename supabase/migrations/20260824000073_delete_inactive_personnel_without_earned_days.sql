-- Allow test/unused passive personnel to be removed when no day was earned.

create or replace function public.delete_inactive_personnel_without_earned_days(
  p_personnel_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
declare
  v_is_active boolean;
begin
  if auth.uid() is null
    or not public.has_module_write_permission('personnel') then
    raise exception 'Personel silme yetkiniz yok' using errcode = '42501';
  end if;

  select is_active into v_is_active
  from public.personnel
  where id = p_personnel_id;

  if not found then
    raise exception 'Personel bulunamadı';
  end if;
  if v_is_active then
    raise exception 'Aktif personel silinemez';
  end if;
  if exists (
    select 1
    from public.attendance_records
    where personnel_id = p_personnel_id
      and status::text in ('worked', 'weekly_rest')
  ) then
    raise exception 'Hak edilmiş günü bulunan personel silinemez';
  end if;

  delete from public.personnel_advances where personnel_id = p_personnel_id;
  delete from public.personnel where id = p_personnel_id;
  return true;
end;
$$;

revoke execute on function public.delete_inactive_personnel_without_earned_days(uuid)
  from public, anon;
grant execute on function public.delete_inactive_personnel_without_earned_days(uuid)
  to authenticated;
