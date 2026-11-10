/**
 * Paket fiyatı yardımcıları (saf mantık; bilerek içe aktarma yok, birim test edilebilir).
 * Fiyatlar KDV DAHİL, TL. Kaynak veritabanındaki plan_prices tablosudur (süper admin düzenler).
 */

export const PLAN_MONTHS = [1, 3, 6] as const;
export type PlanMonths = (typeof PLAN_MONTHS)[number];

/** 3 ve 6 aylık ödemede önerilen indirim (%). Süper admin fiyatı elle de değiştirebilir. */
export const DEFAULT_DISCOUNT_PERCENT: Record<PlanMonths, number> = { 1: 0, 3: 10, 6: 15 };

export const MONTH_LABELS: Record<PlanMonths, string> = { 1: "1 aylık", 3: "3 aylık", 6: "6 aylık" };

type Prices = { price_1m: number | null; price_3m: number | null; price_6m: number | null };

/** Aylık fiyat × ay × (1 − indirim), TL'ye yuvarlanır. 799 × 3 × 0,90 = 2.157. */
export function discountedPrice(monthly: number, months: PlanMonths, percent = DEFAULT_DISCOUNT_PERCENT[months]): number {
  return Math.round(monthly * months * (1 - percent / 100));
}

export function priceForMonths(plan: Prices, months: PlanMonths): number | null {
  return months === 1 ? plan.price_1m : months === 3 ? plan.price_3m : plan.price_6m;
}

/** Toplam fiyatın aya düşen kısmı (yuvarlanmış). */
export function perMonth(total: number, months: PlanMonths): number {
  return Math.round(total / months);
}

/** Aylık fiyata göre kazanç yüzdesi (0 = indirim yok). */
export function savingPercent(plan: Prices, months: PlanMonths): number {
  const total = priceForMonths(plan, months);
  if (months === 1 || total === null || plan.price_1m === null) return 0;
  return Math.max(0, Math.round((1 - total / (plan.price_1m * months)) * 100));
}

/** 2157 → "2.157 ₺" */
export function formatTl(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = Number(amount);
  if (!Number.isFinite(value)) return "—";
  const hasFraction = Math.abs(value % 1) > 0.000001;
  return `${value.toLocaleString("tr-TR", { minimumFractionDigits: hasFraction ? 2 : 0, maximumFractionDigits: 2 })} ₺`;
}

/** Hazır paket için kullanıcı sayısı metni; özel pakette "25 kullanıcıdan fazlası". */
export function userLimitText(plan: { is_custom: boolean; user_limit: number | null }, customFloor = 25): string {
  if (plan.is_custom || plan.user_limit === null) return `${customFloor} kullanıcıdan fazlası`;
  return `${plan.user_limit} aktif kullanıcı`;
}

export function branchLimitText(branches: number): string {
  return branches > 0 ? `Merkez + ${branches} ek şube` : "Tek merkez";
}
