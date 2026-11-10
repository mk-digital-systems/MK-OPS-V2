/**
 * Ödeme listesinden gelir özeti (saf mantık; bilerek içe aktarma yok, birim test edilebilir).
 * İptal edilen ödemeler gelire SAYILMAZ, ayrıca gösterilir.
 */

export type PaymentLike = {
  amount_tl: number | string;
  list_price_tl: number | string | null;
  paid_on: string; // YYYY-MM-DD
  plan: string;
  voided_at: string | null;
};

export type PaymentsSummary = {
  total: number;
  count: number;
  /** Liste fiyatından düşük tahsil edilen toplam fark (uygulanan indirim / pazarlık). */
  discount: number;
  voidedCount: number;
  voidedTotal: number;
  byMonth: { month: string; total: number; count: number }[];
  byPlan: { plan: string; total: number; count: number }[];
};

const money = (value: number | string | null | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarizePayments(payments: PaymentLike[]): PaymentsSummary {
  let total = 0;
  let count = 0;
  let discount = 0;
  let voidedCount = 0;
  let voidedTotal = 0;
  const byMonth = new Map<string, { total: number; count: number }>();
  const byPlan = new Map<string, { total: number; count: number }>();

  for (const payment of payments) {
    const amount = money(payment.amount_tl);
    if (payment.voided_at) {
      voidedCount += 1;
      voidedTotal += amount;
      continue;
    }
    total += amount;
    count += 1;
    if (payment.list_price_tl !== null && payment.list_price_tl !== undefined) {
      discount += Math.max(0, money(payment.list_price_tl) - amount);
    }
    const month = payment.paid_on.slice(0, 7);
    const m = byMonth.get(month) ?? { total: 0, count: 0 };
    byMonth.set(month, { total: m.total + amount, count: m.count + 1 });
    const p = byPlan.get(payment.plan) ?? { total: 0, count: 0 };
    byPlan.set(payment.plan, { total: p.total + amount, count: p.count + 1 });
  }

  return {
    total: round2(total),
    count,
    discount: round2(discount),
    voidedCount,
    voidedTotal: round2(voidedTotal),
    byMonth: [...byMonth.entries()].map(([month, v]) => ({ month, total: round2(v.total), count: v.count })).sort((a, b) => b.month.localeCompare(a.month)),
    byPlan: [...byPlan.entries()].map(([plan, v]) => ({ plan, total: round2(v.total), count: v.count })).sort((a, b) => b.total - a.total),
  };
}

const MONTH_NAMES = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

/** "2026-11" → "Kasım 2026" */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-");
  const name = MONTH_NAMES[Number(m) - 1];
  return name ? `${name} ${year}` : month;
}
