-- Şubeler kendi içinde çalışır: Merkez şantiye şefi de yalnızca kendi şubesinin kayıtlarını görür ve işler.
--
--   1. is_head_office() artık yalnızca firma yöneticisi için doğrudur. Bütün şubeleri görmek, personel/araç/irsaliye
--      onayı ve şubeler arası taşıma yalnızca firma yöneticisindedir (Merkez'e atanmış ya da "Merkez yetkisi"
--      verilmiş şef bu yetkiyi kaybeder; atandığı şubede sıradan şube şefi gibi çalışır).
--   2. Verilmiş Merkez yetkileri temizlenir; yeni yetki verilemez.
--   3. Poz listesi firma geneli olduğundan düzenleme yetkisi değişmez (Merkez şefi düzenlemeye devam eder).

create or replace function public.poz_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.is_super_admin() or case public.current_user_role()
    when 'site_chief' then true
    when 'company_manager' then exists (
      select 1 from public.user_branches ub
      join public.branches b on b.id = ub.branch_id
      where ub.user_id = auth.uid() and b.company_id = public.current_company_id() and b.is_main)
    else false
  end;
$$;

create or replace function public.is_head_office()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select public.current_user_role() = 'site_chief';
$$;

comment on function public.is_head_office() is
  'Yalnızca firma yöneticisi: bütün şubeler, personel/araç/irsaliye onayı ve şubeler arası taşıma';

delete from public.head_office_grants;

create or replace function public.set_user_head_office(p_user_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
set row_security = off
as $$
begin
  raise exception 'Merkez yetkisi kaldırıldı: her şube yalnızca kendi kayıtlarında çalışır' using errcode = '42501';
end;
$$;
