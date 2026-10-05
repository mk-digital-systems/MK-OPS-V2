import type { AttendanceStatus } from "@/types/attendance";

export const ATTENDANCE_STATUSES: {
  value: AttendanceStatus;
  label: string;
  symbol: string;
  className: string;
}[] = [
  {
    value: "worked",
    label: "Çalıştı",
    symbol: "✓",
    className:
      "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  },
  {
    value: "absent",
    label: "Çalışmadı",
    symbol: "✕",
    className:
      "border-red-300 bg-red-100 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300",
  },
  {
    value: "unexcused_absence",
    label: "Mazeretsiz Gelmedi",
    symbol: "MG",
    className:
      "border-orange-300 bg-orange-100 text-orange-800 dark:border-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
  },
  {
    value: "leave",
    label: "İzinli",
    symbol: "İ",
    className:
      "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300",
  },
  {
    value: "medical_report",
    label: "Raporlu",
    symbol: "R",
    className:
      "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  },
  {
    value: "weekly_rest",
    label: "Hafta Tatili",
    symbol: "HT",
    className:
      "border-cyan-200 bg-cyan-50 text-cyan-800 dark:border-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-300",
  },
];

export const MONTH_NAMES = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
] as const;

export const SHORT_DAY_NAMES = [
  "Paz",
  "Pzt",
  "Sal",
  "Çar",
  "Per",
  "Cum",
  "Cmt",
] as const;

export function getAttendanceMeta(status: AttendanceStatus) {
  return ATTENDANCE_STATUSES.find((item) => item.value === status)!;
}

export function getMonthDays(year: number, month: number) {
  const dayCount = new Date(year, month, 0).getDate();
  return Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, month - 1, day);
    const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(
      day
    ).padStart(2, "0")}`;
    return {
      day,
      isoDate,
      dayName: SHORT_DAY_NAMES[date.getDay()],
      isSunday: date.getDay() === 0,
    };
  });
}
