import { intervalToDuration, parseISO } from "date-fns";

export function formatEmploymentDuration(
  startDate: string | null | undefined,
  endDate?: string | null
): string {
  if (!startDate) return "İşe giriş tarihi girilmemiş";

  const start = parseISO(startDate);
  const end = endDate ? parseISO(endDate) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start)
    return "—";

  const duration = intervalToDuration({ start, end });
  const parts = [
    duration.years ? `${duration.years} yıl` : "",
    duration.months ? `${duration.months} ay` : "",
    duration.days ? `${duration.days} gün` : "",
  ].filter(Boolean);

  return parts.join(" ") || "0 gün";
}
