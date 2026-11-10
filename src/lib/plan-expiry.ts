/**
 * Ücretli planın bitimine yaklaşıldığında uygulama içi uyarı (U-07).
 * Deneme süresi uyarısı ayrıdır (TrialBanner). Bu dosya bilerek içe aktarma içermez (birim test edilebilir).
 * E-posta gönderimi YOKTUR: gerçek müşterilere izinsiz e-posta gönderilmez; ayrıca onay ve altyapı doğrulaması gerekir.
 */

export const PLAN_WARNING_DAYS = 7;

export type PlanExpiryWarning = {
  daysLeft: number;
  /** 0-2 gün: acil (kırmızı); 3-7 gün: uyarı (sarı). */
  level: "urgent" | "warning";
};

const DAY = 86_400_000;

export function planExpiryWarning(
  company: { access_status: string; plan: string | null; plan_ends_at: string | null },
  now: number = Date.now()
): PlanExpiryWarning | null {
  if (company.access_status !== "active" || !company.plan || !company.plan_ends_at) return null;
  const end = new Date(company.plan_ends_at).getTime();
  if (Number.isNaN(end)) return null;
  const daysLeft = Math.ceil((end - now) / DAY);
  if (daysLeft < 0 || daysLeft > PLAN_WARNING_DAYS) return null;
  return { daysLeft, level: daysLeft <= 2 ? "urgent" : "warning" };
}
