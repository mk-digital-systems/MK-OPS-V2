-- =============================================================================
-- 00006 — DENEME SÜRECİ: geçmiş iş planlarını geçici olarak silmeye izin ver
-- Sistem gerçek kullanıma geçtiğinde bu politika kaldırılmalıdır.
-- =============================================================================

drop policy if exists "dwp_delete_today_or_future"
  on public.daily_work_plans;

drop policy if exists "dwp_delete_authenticated_temporary"
  on public.daily_work_plans;

create policy "dwp_delete_authenticated_temporary"
  on public.daily_work_plans for delete
  to authenticated
  using (auth.uid() is not null);

comment on policy "dwp_delete_authenticated_temporary"
  on public.daily_work_plans is
  'GEÇİCİ: deneme kayıtlarını temizlemek için geçmiş plan silmeye izin verir.';
