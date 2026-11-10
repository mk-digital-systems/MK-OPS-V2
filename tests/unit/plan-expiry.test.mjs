// U-07: ücretli plan bitimi uyarısı
import { planExpiryWarning } from "../../src/lib/plan-expiry.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };
const now = new Date("2027-03-10T12:00:00Z").getTime();
const day = 86_400_000;
const co = (extra = {}) => ({ access_status: "active", plan: "Profesyonel", plan_ends_at: new Date(now + 5 * day).toISOString(), ...extra });

check("5 gün kaldı → uyarı (sarı)", JSON.stringify(planExpiryWarning(co(), now)) === JSON.stringify({ daysLeft: 5, level: "warning" }));
check("7 gün kaldı → uyarı", planExpiryWarning(co({ plan_ends_at: new Date(now + 7 * day).toISOString() }), now)?.daysLeft === 7);
check("8 gün kaldı → uyarı yok", planExpiryWarning(co({ plan_ends_at: new Date(now + 8 * day).toISOString() }), now) === null);
check("2 gün kaldı → acil (kırmızı)", planExpiryWarning(co({ plan_ends_at: new Date(now + 2 * day).toISOString() }), now)?.level === "urgent");
check("bugün son gün (0 gün) → acil", planExpiryWarning(co({ plan_ends_at: new Date(now + 3600_000).toISOString() }), now)?.daysLeft === 1 || planExpiryWarning(co({ plan_ends_at: new Date(now + 3600_000).toISOString() }), now)?.level === "urgent");
check("süresiz plan (bitiş yok) → uyarı yok", planExpiryWarning(co({ plan_ends_at: null }), now) === null);
check("plan yok (deneme) → bu uyarı yok", planExpiryWarning(co({ plan: null }), now) === null);
check("zaten süresi dolmuş → bu uyarı yok (erişim kapalı)", planExpiryWarning(co({ access_status: "expired", plan_ends_at: new Date(now - day).toISOString() }), now) === null);
check("askıdaki firma → uyarı yok", planExpiryWarning(co({ access_status: "suspended" }), now) === null);
check("geçersiz tarih → güvenli", planExpiryWarning(co({ plan_ends_at: "yok" }), now) === null);

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
