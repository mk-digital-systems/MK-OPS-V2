-- =============================================================================
-- 00010 — Tüm projelerde ek takibi zorunlu
-- 00009'dan sonra çalıştırılmalıdır.
-- =============================================================================

alter table public.projects
  alter column tracks_joint set default true;

update public.projects
set tracks_joint = true;

comment on column public.projects.tracks_joint is
  'Tüm projelerde ek takibi vardır; arayüzde var/yok seçimi gösterilmez.';
