-- 20261113000001 ile eklenen iki tetikleyici fonksiyonunun anonim / herkese açık çalıştırma izni kapatılır.
revoke all on function public.vehicles_set_rent_from() from public, anon, authenticated;
revoke all on function public.guard_vehicle_cost_transactions() from public, anon, authenticated;
