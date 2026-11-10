// Cloudflare Turnstile entegrasyonu: mantık, CSP, hata mesajı, form bağlantıları, sır sızıntısı yok
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  captchaEnabled, captchaOptions, canSubmitWithCaptcha, isCaptchaError, TURNSTILE_SCRIPT_URL,
} from "../../src/lib/captcha.ts";
import { userErrorMessage } from "../../src/lib/user-error.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// --- Site key yoksa mevcut akış aynen ---------------------------------------------------------
check("site key yok/boş/boşluk → CAPTCHA kapalı", [undefined, null, "", "   "].every((v) => captchaEnabled(v) === false));
check("site key var → CAPTCHA açık", captchaEnabled("0x4AAAAAAA-ornek") === true);
check("CAPTCHA kapalıyken token gönderilmez (options boş)", JSON.stringify(captchaOptions(null)) === "{}" && JSON.stringify(captchaOptions(undefined)) === "{}" && JSON.stringify(captchaOptions("")) === "{}");
check("token varsa options.captchaToken olarak gider", JSON.stringify(captchaOptions("abc123")) === JSON.stringify({ captchaToken: "abc123" }));
check("CAPTCHA kapalıyken gönder düğmesi her zaman açık", canSubmitWithCaptcha(false, null, false) && canSubmitWithCaptcha(false, null, true));
check("CAPTCHA açık + token yok → düğme kapalı (doğrulama bekleniyor)", canSubmitWithCaptcha(true, null, false) === false);
check("CAPTCHA açık + token var → düğme açık", canSubmitWithCaptcha(true, "tok", false) === true);
check("token süresi dolunca (null) düğme tekrar kapanır", canSubmitWithCaptcha(true, null, false) === false);
check("widget yüklenemezse (reklam engelleyici) kilitlenmez; sunucu karar verir", canSubmitWithCaptcha(true, null, true) === true);
check("betik adresi Cloudflare Turnstile, explicit render", TURNSTILE_SCRIPT_URL.startsWith("https://challenges.cloudflare.com/turnstile/v0/api.js") && /render=explicit/.test(TURNSTILE_SCRIPT_URL));

// --- Supabase CAPTCHA hatası tanıma ve Türkçe mesaj -----------------------------------------------------
const supa = { message: "captcha verification process failed", code: "captcha_failed", status: 400 };
check("Supabase captcha_failed tanınır", isCaptchaError(supa));
check("yalnızca mesajla da tanınır", isCaptchaError({ message: "Captcha protection: request disallowed" }));
check("yanlış şifre CAPTCHA hatası sayılmaz", !isCaptchaError({ message: "Invalid login credentials", code: "invalid_credentials" }) && !isCaptchaError(null) && !isCaptchaError("x"));
const tr = userErrorMessage(supa);
check("CAPTCHA hatası kullanıcı dostu Türkçe (ham metin yok)", /Güvenlik doğrulaması/.test(tr) && !/captcha|verification/i.test(tr), tr.slice(0, 70));
check("mesaj ne yapılacağını söyler (yeniden doğrula / yenile)", /yeniden doğrulayıp|yenileyin/.test(tr));

// --- CSP: Cloudflare alan adları ---------------------------------------------------------------------
const config = (await import("../../next.config.ts")).default;
const headers = (await config.headers())[0].headers;
const reportOnly = headers.find((h) => h.key === "Content-Security-Policy-Report-Only").value;
const directive = (name) => reportOnly.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " ")) ?? "";
check("CSP script-src Turnstile'a izin verir", directive("script-src").includes("https://challenges.cloudflare.com"));
check("CSP frame-src Turnstile'a izin verir", directive("frame-src").includes("https://challenges.cloudflare.com"));
check("CSP connect-src Turnstile'a izin verir", directive("connect-src").includes("https://challenges.cloudflare.com"));
check("zorunlu CSP hâlâ yalnızca frame-ancestors (uygulama kırılmaz)", headers.find((h) => h.key === "Content-Security-Policy").value === "frame-ancestors 'self'");
check("mevcut güvenlik başlıkları korunuyor", ["Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"].every((k) => headers.some((h) => h.key === k)));

// --- Form bağlantıları: token Supabase Auth çağrılarına gidiyor, widget sıfırlanıyor ----------------------------
const login = read("src/components/auth/login-form.tsx");
const register = read("src/components/auth/register-form.tsx");
const forgot = read("src/components/auth/forgot-password-form.tsx");
for (const [name, src] of [["giriş", login], ["kayıt", register], ["şifremi unuttum", forgot]]) {
  check(`${name}: Turnstile widget'ı var`, /<TurnstileWidget captcha=\{captcha\}/.test(src) && /useTurnstile\(\)/.test(src));
  check(`${name}: captchaToken Auth çağrısına gönderiliyor (...captcha.options / options: captcha.options)`, /captcha\.options/.test(src));
  check(`${name}: her denemeden sonra widget sıfırlanıyor`, /captcha\.reset\(\)/.test(src));
  check(`${name}: gönder düğmesi doğrulama hazır olana dek kapalı`, /disabled=\{loading \|\| !captcha\.ready\}/.test(src));
}
check("giriş: signInWithPassword options.captchaToken alır", /signInWithPassword\(\{[\s\S]*?options: captcha\.options[\s\S]*?\}\)/.test(login));
check("kayıt: signUp options içine captchaToken eklenir (veri ve yönlendirme korunur)", /signUp\(\{[\s\S]*?emailRedirectTo:[\s\S]*?\.\.\.captcha\.options[\s\S]*?\}\)/.test(register) && /data: \{ full_name/.test(register));
check("şifremi unuttum: redirectTo korunur ve captchaToken eklenir", /resetPasswordForEmail\([\s\S]*?redirectTo: `\$\{origin\}\/auth\/callback\?next=\/update-password`[\s\S]*?\.\.\.captcha\.options/.test(forgot));
check("giriş: CAPTCHA reddi 'şifre yanlış' mesajıyla karıştırılmıyor", /isCaptchaError\(error\)[\s\S]{0,200}Güvenlik doğrulaması başarısız/.test(login) && /Giriş başarısız/.test(login));

// --- Şifre sıfırlama ve oturum akışı bozulmadı ---------------------------------------------------------------
const update = read("src/components/auth/update-password-form.tsx");
const callback = read("src/app/auth/callback/route.ts");
const middleware = read("src/middleware.ts");
check("yeni şifre kaydetme (updateUser) CAPTCHA'ya bağlanmadı (oturumla yapılır)", !/captcha/i.test(update) && /updateUser/.test(update));
check("auth callback değişmedi: kod → oturum + güvenli yönlendirme", !/captcha/i.test(callback) && /exchangeCodeForSession/.test(callback) && /safeNextPath/.test(callback));
check("oturum yenileme middleware'i değişmedi", !/captcha/i.test(middleware) && /getUser\(\)/.test(middleware));

// --- Sır sızıntısı yok ----------------------------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (!["node_modules", ".next", ".git"].includes(f.name)) walk(p, out); } else out.push(p);
  }
  return out;
}
const scanned = [...walk(path.join(root, "src")), ...walk(path.join(root, "tests")).filter((p) => !p.endsWith("captcha.test.mjs")), path.join(root, "next.config.ts"), path.join(root, ".env.example")];
const leaks = scanned.filter((p) => /TURNSTILE_SECRET|turnstile[_-]?secret|NEXT_PUBLIC_[A-Z_]*SECRET/i.test(fs.readFileSync(p, "utf8")));
check("kodda/örnek env'de Turnstile SECRET anahtarı veya NEXT_PUBLIC_*SECRET yok", leaks.length === 0, leaks.map((p) => path.relative(root, p)).join(", "));
const hardcoded = scanned.filter((p) => /0x4[A-Za-z0-9_-]{18,}/.test(fs.readFileSync(p, "utf8")));
check("kodda sabit yazılmış gerçek bir Turnstile anahtarı yok (site key yalnızca ortam değişkeninden)", hardcoded.length === 0, hardcoded.map((p) => path.relative(root, p)).join(", "));
const envExample = read(".env.example");
check(".env.example yalnızca NEXT_PUBLIC_TURNSTILE_SITE_KEY'i (boş) belgeliyor", /^NEXT_PUBLIC_TURNSTILE_SITE_KEY=$/m.test(envExample));
check("site key yalnızca ortam değişkeninden okunuyor", /process\.env\.NEXT_PUBLIC_TURNSTILE_SITE_KEY/.test(read("src/components/auth/turnstile-widget.tsx")));

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
