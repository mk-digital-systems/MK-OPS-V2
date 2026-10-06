-- =============================================================================
-- MK OPS — Pazar günü otomatik "Hafta Tatili" puantajı
--
-- Başlangıç şeması zamanlanmış görevi yalnızca pg_cron eklentisi o an açıksa kuruyordu.
-- Bu dosya eklentiyi açar ve görevi (yeniden) kurar: her Pazar 03:05 (İstanbul) bütün
-- firmalarda, o ay için aktif personelin Pazar günleri "Hafta Tatili" işaretlenir
-- (elle girilmiş puantaja dokunulmaz).
--
-- pg_cron açılamazsa dosya hata vermez, uyarı yazar: Supabase → Database → Extensions →
-- pg_cron'u açıp bu dosyayı yeniden çalıştırın. Tekrar çalıştırmak zararsızdır.
-- =============================================================================

do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron açılamadı (%). Supabase → Database → Extensions bölümünden pg_cron''u açıp bu dosyayı yeniden çalıştırın.', sqlerrm;
    return;
  end;

  if exists (select 1 from cron.job where jobname = 'sunday-attendance') then
    perform cron.unschedule('sunday-attendance');
  end if;

  -- pg_cron UTC çalışır: Pazar 00:05 UTC = Pazar 03:05 İstanbul.
  perform cron.schedule(
    'sunday-attendance',
    '5 0 * * 0',
    'select public.ensure_current_sunday_attendance();'
  );
  raise notice 'Pazar hafta tatili görevi kuruldu (her Pazar 03:05).';
end $$;
