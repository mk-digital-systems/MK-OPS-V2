// Hata izleme: DSN yoksa kapalı, kişisel veri (KVKK) gönderilmiyor, gizli anahtar yok
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sentryEnabled, maskSensitive, scrubEvent, scrubBreadcrumb, sentryOptions, IGNORED_ERRORS } from "../../src/lib/sentry-options.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// --- DSN yoksa kapalı ---------------------------------------------------------------------------------
check("DSN yok/boş/boşluk/bozuk → hata izleme kapalı", [undefined, null, "", "   ", "abc", "http://x@y/1", "https://x@y/abc"].every((v) => sentryEnabled(v) === false));
check("geçerli DSN → açık", sentryEnabled("https://abc123@o123.ingest.de.sentry.io/456789") === true);

// --- Maskeleme ------------------------------------------------------------------------------------------------
check("TC kimlik / telefon (9+ hane) maskelenir", maskSensitive("Key (tc_identity_number)=(12345678901) already exists") === "Key (tc_identity_number)=([sayı]) already exists" && maskSensitive("05551112233") === "[sayı]");
check("e-posta maskelenir", maskSensitive("Kullanıcı ayse@firma.com.tr bulunamadı") === "Kullanıcı [e-posta] bulunamadı");
check("kısa sayılar ve normal metin değişmez (hata ayıklamayı bozmaz)", maskSensitive("satır 42 sütun 7: beklenmeyen jeton") === "satır 42 sütun 7: beklenmeyen jeton");

// --- Olay temizliği ----------------------------------------------------------------------------------------------
const event = {
  user: { id: "u1", email: "ayse@firma.com" },
  extra: { form: { tc: "12345678901" } },
  message: "Hata 12345678901",
  request: { url: "https://www.mk-ops.tr/panel/personel?ara=Veli%20Usta#x", cookies: { sb: "secret" }, headers: { authorization: "Bearer abc" }, data: { maas: 30000 }, query_string: "ara=Veli" },
  exception: { values: [{ type: "Error", value: "duplicate key (12345678901) ayse@firma.com" }] },
  breadcrumbs: [
    { category: "console", message: "kisi 12345678901" },
    { category: "fetch", data: { method: "GET", status_code: 200, url: "https://x.supabase.co/rest/v1/personnel?full_name=ilike.*Veli*", request_body: "gizli" } },
    { category: "ui.click", message: "button ayse@firma.com" },
  ],
};
const out = scrubEvent(event);
check("kullanıcı ve ekstra veri silinir", out.user === undefined && out.extra === undefined);
check("istekte yalnızca sorgusuz adres kalır (çerez, başlık, gövde, sorgu yok)", JSON.stringify(out.request) === JSON.stringify({ url: "https://www.mk-ops.tr/panel/personel" }), JSON.stringify(out.request));
check("hata metni ve mesaj maskelenir", out.message === "Hata [sayı]" && out.exception.values[0].value === "duplicate key ([sayı]) [e-posta]", out.exception.values[0].value);
check("konsol kaydı atılır, ağ isteğinde sorgu ve gövde yok, tıklama metni maskelenir", out.breadcrumbs.length === 2
  && out.breadcrumbs[0].data.url === "https://x.supabase.co/rest/v1/personnel" && !("request_body" in out.breadcrumbs[0].data)
  && out.breadcrumbs[1].message === "button [e-posta]", JSON.stringify(out.breadcrumbs));
check("istek nesnesi yoksa çökmez", scrubEvent({ message: "x" }).message === "x");
check("breadcrumb: konsol atılır, diğer kategori korunur", scrubBreadcrumb({ category: "console" }) === null && scrubBreadcrumb({ category: "navigation", message: "a" }).category === "navigation");

// --- Ayarlar ------------------------------------------------------------------------------------------------------------
const opts = sentryOptions("https://a@b.ingest.sentry.io/1", "production", "abc123");
check("ayarlar: kişisel veri gönderme kapalı, yalnızca hatalar (izleme/oturum kaydı yok)", opts.sendDefaultPii === false && opts.tracesSampleRate === 0 && opts.maxBreadcrumbs <= 20);
check("ayarlar: ortam ve sürüm iletilir; ortam boşsa production", opts.environment === "production" && opts.release === "abc123" && sentryOptions("https://a@b/1", undefined, undefined).environment === "production");
check("internet kaynaklı gürültü yok sayılır", ["Failed to fetch", "Load failed", "NetworkError"].every((m) => IGNORED_ERRORS.includes(m)));

// --- Bağlantılar: DSN yokken SDK yüklenmez, gizli anahtar yok ---------------------------------------------------------------
const server = read("src/instrumentation.ts");
const client = read("src/instrumentation-client.ts");
check("sunucu: DSN yoksa başlatma atlanır; SDK yalnızca dinamik yüklenir", /sentryEnabled\(dsn\)\) return/.test(server) && /await import\("@sentry\/nextjs"\)/.test(server) && !/^import .* from "@sentry/m.test(server));
check("tarayıcı: SDK yalnızca DSN varsa dinamik yüklenir (pakete eklenmez)", /if \(sentryEnabled\(dsn\)\)/.test(client) && /import\("@sentry\/nextjs"\)/.test(client) && !/^import .* from "@sentry/m.test(client));
check("her iki başlatmada kişisel veri filtresi bağlı", /beforeSend: \(event\) => scrubEvent\(event\)/.test(server + client) && /beforeBreadcrumb/.test(server + client));
for (const f of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
  const s = read(f);
  check(`${f}: hata Sentry'ye yalnızca DSN varsa bildirilir`, /process\.env\.NEXT_PUBLIC_SENTRY_DSN\) void import\("@sentry\/nextjs"\)/.test(s) && !/^import .* from "@sentry/m.test(s));
}
const cfg = read("next.config.ts");
check("CSP connect-src Sentry ingest adreslerine izin verir; zorunlu CSP hâlâ yalnızca frame-ancestors", /ingest\.sentry\.io/.test(cfg) && /ingest\.de\.sentry\.io/.test(cfg));
const env = read(".env.example");
check(".env.example yalnızca boş NEXT_PUBLIC_SENTRY_DSN belgeliyor (gerçek DSN yok)", /^NEXT_PUBLIC_SENTRY_DSN=$/m.test(env) && !/sentry\.io/.test(env));
check("auth token / secret kodda yok (SENTRY_AUTH_TOKEN, withSentryConfig yok → kaynak haritası yüklenmiyor)", !/SENTRY_AUTH_TOKEN|withSentryConfig/.test(cfg + server + client));

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
