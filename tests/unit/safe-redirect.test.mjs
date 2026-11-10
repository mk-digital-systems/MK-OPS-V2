// G-02 / G-03: güvenli yönlendirme yardımcısı (giriş formu ve /auth/callback ortak kullanır)
import { safeNextPath } from "../../src/lib/safe-redirect.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };

// İzin verilen, normal akışlar aynen korunmalı
const good = [
  ["/panel", "/panel"],
  ["/panel/projects?durum=aktif", "/panel/projects?durum=aktif"],
  ["/panel/work-plans/abc#ekip", "/panel/work-plans/abc#ekip"],
  ["/update-password", "/update-password"],
  ["/admin/gecmis?firma=1", "/admin/gecmis?firma=1"],
  ["/onboarding", "/onboarding"],
  ["/subscription", "/subscription"],
  ["/pending-approval", "/pending-approval"],
];
for (const [input, want] of good) check(`izinli: ${input}`, safeNextPath(input) === want, safeNextPath(input));

// Varsayılan / boş
check("boş değer /panel", safeNextPath(null) === "/panel" && safeNextPath("") === "/panel" && safeNextPath(undefined) === "/panel");
check("özel varsayılan kullanılır", safeNextPath("https://x.com", "/login") === "/login");

// Zararlı varyantlar hepsi /panel'e düşmeli
const bad = [
  "https://evil.com", "http://evil.com/panel", "//evil.com", "///evil.com", "/\evil.com", "\\evil.com",
  "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "@evil.com", ".evil.com", "evil.com",
  "/%2f/evil.com", "/%2F%2Fevil.com", "%2f%2fevil.com", "/%5cevil.com", "/%255cevil.com", "/%252f%252fevil.com",
  "/panel/%0d%0aSet-Cookie:x=1", "/panel\r\nLocation: https://evil.com", "/panel\tx", "/\t/evil.com", "/ /evil.com",
  "/login", "/api/x", "/auth/callback", "/panelx", "/paneladmin", "/%70anel/../../evil", "/%zz",
  "/panel/%E0%A4%A", "/\u0000panel", "/‮/evil.com", "  //evil.com", "/panel/..//evil.com",
];
for (const input of bad) {
  const got = safeNextPath(input);
  check(`reddedildi: ${JSON.stringify(input)}`, got === "/panel", got);
}

// Üst dizine kaçış, izin verilen bölümün dışına çıkamaz
const dotted = safeNextPath("/panel/../admin");
check("/panel/../admin normalize edilir ve izinli bölümde kalır", dotted === "/admin", dotted);
const escaped = safeNextPath("/panel/../login");
check("/panel/../login izinsiz bölüme çıkamaz", escaped === "/panel", escaped);

// Her sonuç ya göreli yol olmalı
for (const input of [...bad, ...good.map((g) => g[0])]) {
  const out = safeNextPath(input);
  if (!(out.startsWith("/") && !out.startsWith("//") && !out.includes("\\"))) check(`çıktı güvenli değil: ${input}`, false, out);
}

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
console.log("\nhepsi geçti");
