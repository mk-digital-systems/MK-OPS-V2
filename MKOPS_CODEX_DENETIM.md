# MK OPS — Codex Bağımsız Denetim Notları

Bu belge, değişiklikleri bağımsız olarak doğrulamak isteyen denetçi içindir. Dal: `fix/guvenlik-asama-1`, taban: `main` @ `229a532`.

```
git diff 229a532..fix/guvenlik-asama-1 --stat
```

## Test komutları
```
npm ci
npm run typecheck          # tsc --noEmit
npm run lint               # eslint (0 hata; test dosyalarında 10 eski uyarı)
npm run test:unit          # 2 dosya / 63 kontrol
npm run test:db            # 30 dosya / 889 kontrol (PGlite; ~3 dk)
npm audit --omit=dev       # 5 uyarı (0 kritik); bkz. düzeltme raporu §1
node tests/db/save-work-plan.test.mjs       # V-01
node tests/db/branch-helpers-guard.test.mjs # V-04
node tests/db/work-plan-drafts.test.mjs     # V-03 (DB tarafı)
```
`npm run build` bu geliştirme makinesinde çalıştırılamadı (7,9 GB RAM'in ~0,8 GB'ı boş; dokunulmamış `HEAD` da aynı şekilde çöküyor). Bağımsız bir ortamda **mutlaka** çalıştırın.

## Önce bakılması gereken riskli noktalar
1. **`supabase/migrations/20261120000003_save_work_plan_rpc.sql`** — `SECURITY INVOKER` olması bilerek. `default_branch_for` `authenticated`'a açık olmadığı için şube verilmezse `daily_work_plans.a0_set_default_branch` tetikleyicisine güvenilir; arama şube verilmediğinde RLS'in izin verdiği o günkü plana bakar, birden fazlaysa hata verir. Doğrulama mantığı hem TS'de (`upsertFullPlan`) hem SQL'de var (tekrar kasıtlı: DB savunma hattı). Gerçek iki-bağlantılı yarış testi yok (PGlite tek bağlantı).
2. **`src/middleware.ts`** — Yeni: her `sb-` çerezli istekte `getUser()` (ağ çağrısı). Matcher `/auth/callback`, statik dosyalar ve `api`'yi hariç tutuyor. Yönlendirme yok. Gerçek oturumla jeton yenilemeyi bir önizlemede deneyin; `request.cookies.set` + yeni `NextResponse.next` ile `x-app-pathname` başlığının korunduğuna bakın (`buildResponse`).
3. **`src/lib/safe-redirect.ts`** — İzin listesi: `/panel, /admin, /onboarding, /subscription, /pending-approval, /update-password`. Yeni bir giriş sonrası hedefi eklenecekse buraya eklenmeli. Atlatma vektörü bulursanız `tests/unit/safe-redirect.test.mjs` içine ekleyin.
4. **`src/lib/supabase/request-cache.ts`** — `requireModuleWrite` / `requireCanApprove` `redirect()` çağırır (sayfa render'ında). `panel/layout.tsx` hâlâ aynı kontrolleri yapıyor; çift kontrol bilerek.
5. **`next.config.ts`** — `Content-Security-Policy-Report-Only` zorunlu değil; `Content-Security-Policy: frame-ancestors 'self'` zorunlu. `'unsafe-inline'`/`'unsafe-eval'` Report-Only içinde bilerek var (GA ve Next.js için); zorunlu CSP'de nonce'a geçilmesi önerilir.
6. **`src/modules/projects/project-repository.ts`** — `list` sıralamasına son anahtar olarak `id` eklendi (sayfalar arası kararlılık); davranış değişikliği: aynı değerli satırların sırası artık deterministik.

## Aşama 4 değişiklikleri
- `src/components/ui/confirm-dialog.tsx` (+ `dialog.tsx`'e `DialogDescription`), `src/app/layout.tsx` (`ConfirmProvider`), 14 bileşende `window.confirm` → `await confirm(...)` (otomatik dönüşüm; `tsc` + `eslint` denetledi). İnceleme önerisi: dönüştürülen işleyicilerin `async` olması davranışı değiştirmemeli; hook'lar bileşen düzeyinde.
- `src/app/manifest.ts`, `src/hooks/use-unsaved-changes.ts`, `work-plan-editor.tsx` (dirty uyarısı).

## Son eklemeler
- `src/lib/user-error.ts` (+ 75 `toast` çağrısı), `src/lib/setup-guide.ts` + `components/dashboard/setup-guide.tsx`, `src/lib/plan-expiry.ts` + `trial-banner.tsx`, kalan `window.confirm` dönüşümleri, `docs/dahili/yedekleme-ve-geri-donus.md`.
- Resmi tatiller: `supabase/migrations/20261121000001_official_holidays.sql`, `tests/db/official-holidays.test.mjs`, puantaj bileşenleri, `/admin/tatiller`. **Bordro/ekstre SQL'ini değiştirir**; denetçiden özellikle `get_monthly_payroll` ve `subcontractor_salary_rows` farklarına bakması istenir (tek fark: `extract(isodow …)=7` → `is_rest_day(…)`).

## Değişen dosyalar (özet)
- Bağımlılık: `package.json`, `package-lock.json`
- Yönlendirme/oturum: `src/lib/safe-redirect.ts`, `src/components/auth/login-form.tsx`, `src/app/auth/callback/route.ts`, `src/middleware.ts`
- Başlıklar/hata: `next.config.ts`, `src/app/error.tsx`, `src/app/global-error.tsx`
- Yetki: `src/lib/supabase/request-cache.ts`, `src/app/panel/layout.tsx`, `src/app/panel/{approvals,projects/new,projects/[id]/edit,work-plans/new,work-plans/[id]/edit,work-plans/drafts/[id]/edit}/page.tsx`
- Dışa aktarım: `src/lib/paginate.ts`, `src/modules/projects/project-repository.ts`, `src/components/projects/projects-table.tsx`, `src/app/panel/projects/page.tsx`
- İş planı: `src/modules/work-plans/work-plan-repository.ts`, `src/components/work-plans/work-plan-editor.tsx`
- Migration: `20261120000002_…`, `20261120000003_…`
- Test: `tests/unit/*`, `tests/db/{save-work-plan,branch-helpers-guard,work-plan-drafts}.test.mjs`
- CI/lint: `.github/workflows/ci.yml`, `eslint.config.mjs`

## Açık kalan bulgular (düzeltilmedi)
| Konu | Neden |
|---|---|
| Zod 3→4 | Kırıcı geçiş; form şemaları testli ayrı iş |
| Sentry/hata izleme | Harici hesap/ücret: onay |
| CSP zorunluluğu | Önce canlıda Report-Only izlenmeli |
| Süper admin MFA/AAL2 | Kurtarma prosedürü ve onay gerekli |
| Ön yüz/E2E testleri | Altyapı yok |
| Aşama 4 kalanı: abonelik e-postası, paket/yasal (U-08/U-09), büyük bileşenler (U-10), çevrimdışı | E-posta altyapısı doğrulaması, ticari karar ve tarayıcı testi gerekir |
| `delete-user` Edge Function mesajları metinde düzeltildi, **deploy edilmedi** | Deploy onayı |
| `delete-user` Edge Function adlandırma/oran sınırı | Deploy gerekir |
| Supabase/Vercel panel ayarları | Erişim yok: doğrulanamadı |

## Denetçiden istenenler
- `save_work_plan` için gerçek Postgres'te (ör. iki `psql` oturumu) eşzamanlı çağrı denemesi.
- Önizlemede jeton yenileme ve şifre sıfırlama regresyonu.
- `safe-redirect` için ek atlatma denemeleri.
