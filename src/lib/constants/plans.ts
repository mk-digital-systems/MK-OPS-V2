import type { CompanyAccessStatus } from "@/types/auth";

/** Önerilen plan adları; süper admin farklı bir ad da yazabilir. */
export const PLAN_PRESETS = ["Başlangıç", "Profesyonel", "Kurumsal"] as const;

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
