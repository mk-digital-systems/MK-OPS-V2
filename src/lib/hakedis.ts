import type { CurrencyCode } from "@/types/auth";

export type HakedisPeriod = {
  /** Başlangıç (dahil) YYYY-MM-DD */
  start: string;
  /** Bitiş (dahil) YYYY-MM-DD */
  end: string;
  label: string;
  isActive: boolean;
};

const pad = (value: number) => String(value).padStart(2, "0");
const toISO = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

function label(start: Date, end: Date) {
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${start.getDate()} ${MONTHS[start.getMonth()]}${sameYear ? "" : ` ${start.getFullYear()}`} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`;
}

/**
 * Hakediş dönemi: başlangıç gününden başlar, bir sonraki ayın aynı gününden
 * bir gün önce biter. Örn. başlangıç günü 20 → 20 Şubat – 19 Mart.
 */
export function getPeriodContaining(date: Date, startDay: number): HakedisPeriod {
  const day = date.getDate();
  const start =
    day >= startDay
      ? new Date(date.getFullYear(), date.getMonth(), startDay)
      : new Date(date.getFullYear(), date.getMonth() - 1, startDay);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, startDay - 1);
  return { start: toISO(start), end: toISO(end), label: label(start, end), isActive: false };
}

/** Aktif dönem ve öncesindeki `pastCount` dönem (yeniden eskiye). */
export function listPeriods(startDay: number, pastCount = 12, today = new Date()): HakedisPeriod[] {
  const active = { ...getPeriodContaining(today, startDay), isActive: true };
  const result: HakedisPeriod[] = [active];
  let cursor = new Date(`${active.start}T00:00:00`);
  for (let i = 0; i < pastCount; i += 1) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
    const period = getPeriodContaining(cursor, startDay);
    result.push(period);
    cursor = new Date(`${period.start}T00:00:00`);
  }
  return result;
}

export function formatMoney(value: number | string | null | undefined, currency: CurrencyCode = "TRY"): string {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(value));
}

export const CURRENCY_OPTIONS: { value: CurrencyCode; label: string }[] = [
  { value: "TRY", label: "Türk lirası (₺)" },
  { value: "USD", label: "ABD doları ($)" },
  { value: "EUR", label: "Euro (€)" },
];
