-- =============================================================================
-- 00029 — Personele TC Kimlik No alanı ekle
-- Mevcut kayıtlar için nullable; yalnızca 11 rakam kabul edilir.
-- =============================================================================

alter table public.personnel
  add column if not exists tc_identity_number text;

alter table public.personnel
  drop constraint if exists personnel_tc_identity_number_format;

alter table public.personnel
  add constraint personnel_tc_identity_number_format
  check (
    tc_identity_number is null
    or tc_identity_number ~ '^[0-9]{11}$'
  );

create unique index if not exists personnel_tc_identity_number_unique
  on public.personnel (tc_identity_number)
  where tc_identity_number is not null;

comment on column public.personnel.tc_identity_number is
  'Personelin 11 haneli TC Kimlik Numarası; mevcut eski kayıtlar için nullable.';
