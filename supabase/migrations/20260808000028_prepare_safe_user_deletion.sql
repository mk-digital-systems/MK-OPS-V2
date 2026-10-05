-- =============================================================================
-- 00028 — Kullanıcı silinirken geçmiş iş kayıtlarını koru
-- 00027'den sonra çalıştırılmalıdır.
-- =============================================================================

alter table public.shared_notes
  alter column created_by drop not null;

alter table public.shared_notes
  drop constraint if exists shared_notes_created_by_fkey;

alter table public.shared_notes
  add constraint shared_notes_created_by_fkey
  foreign key (created_by)
  references auth.users (id)
  on delete set null;

comment on column public.shared_notes.created_by is
  'Notu oluşturan kullanıcı; hesap silinirse not geçmişi korunur.';
