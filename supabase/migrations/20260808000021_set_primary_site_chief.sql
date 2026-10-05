-- =============================================================================
-- 00021 — Ana şantiye şefi hesabını kesin olarak ata
-- 00020'den sonra çalıştırılmalıdır.
-- 00018 daha önce çalıştırılmış veritabanlarını da düzeltir.
-- =============================================================================

do $$
declare
  v_site_chief_id constant uuid :=
    '61bd2d56-8ea0-4e22-92d1-246742a8f6b4'::uuid;
begin
  if not exists (
    select 1 from public.profiles where id = v_site_chief_id
  ) then
    raise exception 'Şantiye şefi yapılacak profil bulunamadı: %',
      v_site_chief_id;
  end if;

  -- Sistemde tek şantiye şefi bulunur.
  update public.profiles
  set
    role = 'pending',
    is_approved = false,
    approved_at = null,
    approved_by = null
  where role = 'site_chief'
    and id <> v_site_chief_id;

  update public.profiles
  set
    role = 'site_chief',
    is_approved = true,
    approved_at = coalesce(approved_at, now()),
    approved_by = v_site_chief_id
  where id = v_site_chief_id;

  -- Şantiye şefi alan bazlı yönetici izinlerine ihtiyaç duymaz.
  delete from public.company_manager_permissions
  where user_id = v_site_chief_id;
end $$;
