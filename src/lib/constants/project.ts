export const PROJECT_STATUSES = [
  {
    value: "waiting",
    label: "Başlamadı",
    color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
    bar: "bg-slate-400",
  },
  {
    value: "in_progress",
    label: "Devam Ediyor",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
    bar: "bg-blue-500",
  },
  {
    value: "on_hold",
    label: "Beklemede",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    bar: "bg-amber-500",
  },
  {
    value: "delayed",
    label: "Gecikti",
    color: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
    bar: "bg-rose-500",
  },
  {
    value: "completed",
    label: "Tamamlandı",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    bar: "bg-emerald-500",
  },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["value"];

export function getStatusLabel(status: string): string {
  return PROJECT_STATUSES.find((item) => item.value === status)?.label ?? status;
}

export function getStatusColor(status: string): string {
  return PROJECT_STATUSES.find((item) => item.value === status)?.color ?? PROJECT_STATUSES[0].color;
}

export function getStatusBarColor(status: string): string {
  return PROJECT_STATUSES.find((item) => item.value === status)?.bar ?? PROJECT_STATUSES[0].bar;
}

export const STAGE_STATUSES = [
  { value: "not_started", label: "Başlamadı", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200" },
  { value: "in_progress", label: "Devam ediyor", color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  { value: "done", label: "Tamamlandı", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
] as const;

export type StageStatus = (typeof STAGE_STATUSES)[number]["value"];

export function getStageStatusMeta(status: string) {
  return STAGE_STATUSES.find((item) => item.value === status) ?? STAGE_STATUSES[0];
}

/** Aşama birimi önerileri; firma farklı bir birim de yazabilir. */
export const UNIT_SUGGESTIONS = ["m", "m²", "m³", "km", "adet", "ton", "kg", "lt", "saat", "gün", "araç", "nokta"];

export const PROJECT_TYPE_COLORS = ["#2563eb", "#0891b2", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#9333ea", "#475569"];

export type ProjectTypeTemplate = {
  name: string;
  description: string;
  has_sections: boolean;
  section_label: string;
  stages: { name: string; unit?: string }[];
};

/** Proje türü şablonları; firma ekledikten sonra dilediği gibi düzenler. */
export const PROJECT_TYPE_TEMPLATES: ProjectTypeTemplate[] = [
  {
    name: "Bina İnşaatı",
    description: "Konut, ticari veya kamu binası yapımı",
    has_sections: true,
    section_label: "Blok",
    stages: [
      { name: "Hafriyat", unit: "m³" },
      { name: "Temel" },
      { name: "Kaba inşaat" },
      { name: "Çatı" },
      { name: "Mekanik ve elektrik tesisat" },
      { name: "İnce işler" },
      { name: "Teslim" },
    ],
  },
  {
    name: "Altyapı Hattı",
    description: "Su, kanalizasyon veya yağmur suyu hattı",
    has_sections: true,
    section_label: "Etap",
    stages: [
      { name: "Kazı izni" },
      { name: "Kazı", unit: "m" },
      { name: "Boru döşeme", unit: "m" },
      { name: "Test" },
      { name: "Dolgu", unit: "m" },
      { name: "Yol onarımı", unit: "m²" },
    ],
  },
  {
    name: "Doğalgaz Hattı",
    description: "Doğalgaz dağıtım hattı ve servis bağlantıları",
    has_sections: true,
    section_label: "Hat",
    stages: [
      { name: "Kazı izni" },
      { name: "Kazı", unit: "m" },
      { name: "Boru döşeme", unit: "m" },
      { name: "Servis hattı", unit: "adet" },
      { name: "Basınç testi" },
      { name: "Dolgu ve asfalt", unit: "m²" },
    ],
  },
  {
    name: "Elektrik Tesisatı",
    description: "Enerji hattı, pano ve aydınlatma işleri",
    has_sections: false,
    section_label: "Bölüm",
    stages: [
      { name: "Keşif" },
      { name: "Kablo kanalı", unit: "m" },
      { name: "Kablo çekimi", unit: "m" },
      { name: "Pano montajı", unit: "adet" },
      { name: "Test ve devreye alma" },
    ],
  },
  {
    name: "Fiber / Telekom Hattı",
    description: "Fiber optik veya bakır hat tesisi",
    has_sections: true,
    section_label: "Bölge",
    stages: [
      { name: "Kazı", unit: "m" },
      { name: "Kablo çekimi", unit: "m" },
      { name: "Ek", unit: "adet" },
      { name: "Ölçüm ve test" },
    ],
  },
  {
    name: "Araç Bakım / Servis",
    description: "Filo bakımı, servis veya montaj işleri",
    has_sections: false,
    section_label: "Bölüm",
    stages: [
      { name: "Kabul" },
      { name: "Arıza tespiti" },
      { name: "Parça temini" },
      { name: "Onarım", unit: "saat" },
      { name: "Kontrol ve teslim" },
    ],
  },
  {
    name: "Genel İş",
    description: "Her türlü saha işi için basit akış",
    has_sections: false,
    section_label: "Bölüm",
    stages: [{ name: "Hazırlık" }, { name: "Uygulama" }, { name: "Kontrol" }, { name: "Teslim" }],
  },
];

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export function formatQuantity(value: number | string | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  const text = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(number);
  return unit ? `${text} ${unit}` : text;
}

export function todayISODate(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

export function tomorrowISODate(): string {
  const [year, month, day] = todayISODate().split("-").map(Number);
  const tomorrow = new Date(Date.UTC(year, month - 1, day + 1));
  return tomorrow.toISOString().slice(0, 10);
}
