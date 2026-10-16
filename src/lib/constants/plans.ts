import type { CompanyAccessStatus } from "@/types/auth";

/** Hazır planlar; seçilince kullanıcı / rol / şube sayıları aşağıdaki değerlerle dolar ve kilitlenir. */
export const PLAN_PRESETS = ["Başlangıç", "Profesyonel", "Kurumsal"] as const;

/** Özel plan: bütün sayıları süper admin elle belirler. */
export const CUSTOM_PLAN = "Özel";

export type PlanLimits = {
  /** Toplam kullanıcı */
  users: number;
  siteChiefs: number;
  managers: number;
  accountants: number;
  /** Açılabilecek ek şube (Merkez hariç) */
  branches: number;
};

/**
 * Hazır planların sayıları. Dağılımı buradan değiştirin; yeni seçimlerde bu değerler kullanılır
 * (mevcut firmalar kendi kayıtlı değerlerini korur).
 */
export const PLAN_PRESET_LIMITS: Record<(typeof PLAN_PRESETS)[number], PlanLimits> = {
  Başlangıç: { users: 3, siteChiefs: 1, managers: 1, accountants: 1, branches: 0 },
  Profesyonel: { users: 5, siteChiefs: 1, managers: 3, accountants: 1, branches: 2 },
  Kurumsal: { users: 7, siteChiefs: 2, managers: 4, accountants: 1, branches: 5 },
};

/** Sunulan abonelik süreleri (ay). 12 aylık abonelik yok. */
export const PLAN_DURATION_MONTHS = [1, 3, 6] as const;

export const ACCESS_STATUS_LABELS: Record<CompanyAccessStatus, string> = {
  trial: "Deneme",
  active: "Aktif",
  expired: "Süresi doldu",
  suspended: "Askıda",
};

export const ACCESS_STATUS_CLASSES: Record<CompanyAccessStatus, string> = {
  trial: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  expired: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  suspended: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
};
