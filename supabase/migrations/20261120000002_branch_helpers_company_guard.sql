-- =============================================================================
-- MK OPS — personnel_branch_on / vehicle_branch_on: firma doğrulaması (V-04)
--
-- Bu iki yardımcı SECURITY DEFINER + row_security=off çalışır ve giriş yapmış her kullanıcıya açıktır.
-- Başka firmanın personel/araç UUID'si verilirse o kaydın şube kimliğini döndürebiliyordu.
-- Artık kayıt, çağıranın firmasına ait değilse NULL döner.
--
-- Kullanım yerleri (hepsi giriş yapmış kullanıcıyla çalışır): get_attendance_branch_days ve yakıt kaydı
-- tetikleyicisi. auth.uid() boşsa (SQL Editor / service_role gibi son kullanıcısız bağlam) kontrol atlanır;
-- bu bağlamlar zaten RLS'i aşan güvenilir bağlamlardır.
-- Aynı imza ve yetkiler (anon/PUBLIC kapalı, authenticated açık) korunur.
-- =============================================================================
begin;

create or replace function public.personnel_branch_on(p_personnel_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when exists (
      select 1 from public.personnel x
      where x.id = p_personnel_id
        and (auth.uid() is null or x.company_id = public.current_company_id())
    ) then coalesce(
      (select h.branch_id from public.personnel_branch_history h
       where h.personnel_id = p_personnel_id and h.start_date <= p_date order by h.start_date desc limit 1),
      (select h.branch_id from public.personnel_branch_history h
       where h.personnel_id = p_personnel_id order by h.start_date limit 1),
      (select p.branch_id from public.personnel p where p.id = p_personnel_id))
  end;
$$;

create or replace function public.vehicle_branch_on(p_vehicle_id uuid, p_date date)
returns uuid
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case
    when exists (
      select 1 from public.vehicles x
      where x.id = p_vehicle_id
        and (auth.uid() is null or x.company_id = public.current_company_id())
    ) then coalesce(
      (select h.branch_id from public.vehicle_branch_history h
       where h.vehicle_id = p_vehicle_id and h.start_date <= p_date order by h.start_date desc limit 1),
      (select h.branch_id from public.vehicle_branch_history h
       where h.vehicle_id = p_vehicle_id order by h.start_date limit 1),
      (select v.branch_id from public.vehicles v where v.id = p_vehicle_id))
  end;
$$;

-- create or replace yetkileri korur; yine de açıkça yaz.
revoke all on function public.personnel_branch_on(uuid, date) from public, anon;
revoke all on function public.vehicle_branch_on(uuid, date) from public, anon;
grant execute on function public.personnel_branch_on(uuid, date) to authenticated;
grant execute on function public.vehicle_branch_on(uuid, date) to authenticated;

commit;
