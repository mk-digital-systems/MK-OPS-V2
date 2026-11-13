// Süper admin MFA: yönlendirme kuralı, kod doğrulama, hata mesajları, bağlantılar
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MFA_VERIFY_PATH, needsMfaStep, shouldRedirectToMfa, mfaVerifyHref, normalizeTotp, isTotpCode, mfaErrorMessage } from "../../src/lib/mfa.ts";
import { safeNextPath } from "../../src/lib/safe-redirect.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const step = { currentLevel: "aal1", nextLevel: "aal2" };
check("faktörü olan aal1 oturum ikinci adım ister", needsMfaStep(step) === true);
check("aal2 oturum, faktörsüz aal1 oturum ve bilinmeyen durum ikinci adım istemez", !needsMfaStep({ currentLevel: "aal2", nextLevel: "aal2" }) && !needsMfaStep({ currentLevel: "aal1", nextLevel: "aal1" }) && !needsMfaStep(null) && !needsMfaStep(undefined) && !needsMfaStep({}));

// Yönlendirme yalnızca uygulama bölümlerinde ve GET isteklerinde
for (const p of ["/admin", "/admin/odemeler", "/panel", "/panel/personel/5", "/onboarding", "/subscription", "/pending-approval"]) {
  check(`yönlendirilir: ${p}`, shouldRedirectToMfa(p, "GET", step));
}
for (const p of ["/", "/login", "/register", "/forgot-password", "/update-password", MFA_VERIFY_PATH, "/gizlilik-politikasi", "/cozumler/hakedis", "/auth/callback", "/api/x", "/adminx", "/paneller"]) {
  check(`yönlendirilmez: ${p}`, !shouldRedirectToMfa(p, "GET", step));
}
check("POST/PUT gibi istekler yönlendirilmez (sunucu eylemleri bozulmaz)", !shouldRedirectToMfa("/admin", "POST", step) && !shouldRedirectToMfa("/panel", "PUT", step));
check("ikinci adım gerekmiyorsa hiç yönlendirilmez", !shouldRedirectToMfa("/admin", "GET", { currentLevel: "aal2", nextLevel: "aal2" }) && !shouldRedirectToMfa("/admin", "GET", null));
check("yönlendirme döngüsü yok: doğrulama sayfasının kendisi muaf", !shouldRedirectToMfa(MFA_VERIFY_PATH, "GET", step));

// Yönlendirme adresi
const href = mfaVerifyHref("/admin/odemeler", "?yil=2026");
check("doğrulama adresi dönüş yolunu kodlar", href === "/mfa-dogrulama?next=%2Fadmin%2Fodemeler%3Fyil%3D2026", href);
check("dönüş yolu güvenli yönlendirme filtresinden geçer (admin yolu korunur)", safeNextPath(decodeURIComponent(href.split("next=")[1]), "/admin") === "/admin/odemeler?yil=2026");
check("kötü niyetli dönüş yolu varsayılana düşer", safeNextPath("https://kotu.example", "/admin") === "/admin" && safeNextPath("//kotu.example", "/admin") === "/admin");

// Kod biçimi
check("6 haneli kod geçerli; boşluk ve tire temizlenir", isTotpCode("123456") && isTotpCode("123 456") && isTotpCode("123-456") && normalizeTotp(" 12 34-56 ") === "123456");
check("5/7 hane, harf ve boş değer geçersiz", !isTotpCode("12345") && !isTotpCode("1234567") && !isTotpCode("12a456") && !isTotpCode(""));

// Hata mesajları Türkçe
check("hatalı kod mesajı Türkçe ve ne yapılacağını söyler", /Kod hatalı/.test(mfaErrorMessage({ message: "Invalid TOTP code entered" })) && /güncel/.test(mfaErrorMessage({ message: "Invalid TOTP code entered" })));
check("çok deneme ve ağ hataları ayrı mesaj", /Çok fazla deneme/.test(mfaErrorMessage({ message: "over_request_rate_limit" })) && /İnternet/.test(mfaErrorMessage({ message: "Failed to fetch" })));
check("bilinmeyen hata ham İngilizce metin göstermez", !/[a-z]{4,} [a-z]{3,}/i.test(mfaErrorMessage({ message: "some weird upstream failure" }).replace(/[çğıöşüÇĞİÖŞÜ]/g, "")) || /İşlem tamamlanamadı/.test(mfaErrorMessage({ message: "some weird upstream failure" })));
check("null/boş hata çökmez", /İşlem tamamlanamadı/.test(mfaErrorMessage(null)) && /İşlem tamamlanamadı/.test(mfaErrorMessage(undefined)));

// Bağlantılar
const mw = read("src/middleware.ts");
check("ara katman: MFA yönlendirmesi shouldRedirectToMfa ile, yenilenen çerezler taşınarak", /shouldRedirectToMfa\(pathname, request\.method, levels\)/.test(mw) && /getSetCookie\(\)/.test(mw) && /redirect\.headers\.append\("set-cookie"/.test(mw));
check("ara katman: hata olursa site açılır (try/catch korunur) ve oturum çerezi yoksa ağ çağrısı yok", /catch \(error\)/.test(mw) && /if \(!url \|\| !anonKey \|\| !hasSession\) return response;/.test(mw));
const verifyForm = read("src/components/auth/mfa-verify-form.tsx");
check("doğrulama formu: challengeAndVerify, güvenli dönüş yolu, faktör yoksa ikinci adım atlanır", /challengeAndVerify/.test(verifyForm) && /safeNextPath\(next, "\/admin"\)/.test(verifyForm) && /router\.replace\(target\)/.test(verifyForm));
const mgr = read("src/components/admin/mfa-manager.tsx");
check("güvenlik sayfası: ekleme, doğrulama, kaldırma; son doğrulayıcıyı kaldırma uyarısı", /mfa\.enroll/.test(mgr) && /challengeAndVerify/.test(mgr) && /mfa\.unenroll/.test(mgr) && /son doğrulayıcı/i.test(mgr));
check("güvenlik sayfası: yarım kalan kayıtlar temizlenir, kurtarma yolu yazılı", /status === "unverified"/.test(mgr) && /auth\.mfa_factors/.test(mgr));
check("admin menüsünde Güvenlik bağlantısı", /\/admin\/guvenlik/.test(read("src/components/admin/admin-shell.tsx")));
const mig = read("supabase/migrations/20261123000001_super_admin_mfa.sql");
check("migration: aal2 şartı, faktörsüz yönetici etkilenmez, açıklayıcı hata, auth.mfa_factors okunabilirlik denetimi", /'aal2'/.test(mig) && /f\.status = 'verified'/.test(mig) && /mfa_required/.test(mig) && /perform 1 from auth\.mfa_factors/.test(mig));
check("migration: yetkiler değiştirilmiyor (grant/revoke yok, create or replace)", !/\bgrant\b|\brevoke\b/i.test(mig.replace(/--.*$/gm, "")) && /create or replace function public\.is_super_admin/.test(mig));

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
