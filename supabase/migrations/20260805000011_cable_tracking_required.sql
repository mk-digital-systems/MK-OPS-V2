-- =============================================================================
-- 00011 — Tüm projelerde kablo takibi zorunlu
-- 00010'dan sonra çalıştırılmalıdır.
-- =============================================================================

alter table public.projects
  alter column tracks_cable set default true;

update public.projects
set tracks_cable = true;

comment on column public.projects.tracks_cable is
  'Tüm projelerde kablo takibi vardır; arayüzde var/yok seçimi gösterilmez.';
