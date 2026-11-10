// Gelir özeti: iptaller gelire sayılmaz, ay/plan kırılımı, indirim farkı
import { summarizePayments, monthLabel } from "../../src/lib/payments-summary.ts";

let failures = 0;
const check = (name, ok, more = "") => { console.log(`${ok ? "ok  " : "FAIL"} ${name}${more ? ` — ${more}` : ""}`); if (!ok) failures++; };

const p = (amount, list, paid_on, plan, voided_at = null) => ({ amount_tl: amount, list_price_tl: list, paid_on, plan, voided_at });
const empty = summarizePayments([]);
check("boş liste: sıfırlar ve boş kırılımlar", empty.total === 0 && empty.count === 0 && empty.discount === 0 && empty.byMonth.length === 0 && empty.byPlan.length === 0);

const s = summarizePayments([
  p("2157.00", 2157, "2026-11-03", "Başlangıç"),
  p(4000, 4047, "2026-11-20", "Profesyonel"),
  p(7645, 7645, "2026-10-15", "Profesyonel"),
  p(9999, 9999, "2026-11-25", "Kurumsal", "2026-11-26T10:00:00Z"),
  p("25000.50", null, "2026-09-01", "Özel Kurumsal"),
]);
check("toplam iptal edilmeyenlerin toplamı (ondalık dahil)", s.total === 2157 + 4000 + 7645 + 25000.5, String(s.total));
check("adet iptaller hariç", s.count === 4, String(s.count));
check("iptal edilen ayrıca sayılır ve gelire girmez", s.voidedCount === 1 && s.voidedTotal === 9999);
check("indirim farkı: yalnızca liste fiyatı daha yüksekse (4047-4000=47)", s.discount === 47, String(s.discount));
check("liste fiyatı olmayan (özel) ödeme indirime sayılmaz", s.discount === 47);
check("ay kırılımı yeniden eskiye; Kasım 2 ödeme", s.byMonth.map((m) => m.month).join() === "2026-11,2026-10,2026-09" && s.byMonth[0].total === 6157 && s.byMonth[0].count === 2, JSON.stringify(s.byMonth[0]));
check("plan kırılımı toplama göre azalan; iptal edilen Kurumsal yok", s.byPlan[0].plan === "Özel Kurumsal" && !s.byPlan.some((x) => x.plan === "Kurumsal") && s.byPlan.find((x) => x.plan === "Profesyonel").total === 11645);
check("tutar metin olarak gelse de toplanır (numeric)", summarizePayments([p("799.00", 799, "2026-11-01", "Başlangıç")]).total === 799);
check("geçersiz tutar 0 sayılır, çökmez", summarizePayments([p("abc", null, "2026-11-01", "Başlangıç")]).total === 0);
check("kuruş yuvarlama: 0.1 + 0.2 = 0.3", summarizePayments([p(0.1, null, "2026-11-01", "A"), p(0.2, null, "2026-11-02", "A")]).total === 0.3);
check("ay etiketi Türkçe", monthLabel("2026-11") === "Kasım 2026" && monthLabel("2027-01") === "Ocak 2027" && monthLabel("2026-13") === "2026-13");

if (failures) { console.log(`\n${failures} başarısız`); process.exit(1); }
