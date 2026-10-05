export const FIXED_PROJECT_TYPES = [
  { key: "HP_ODAKLI", label: "HP Odaklı" },
  { key: "KURUMSAL_TTVPN", label: "Kurumsal TTVPN" },
  { key: "BGFD", label: "BGFD" },
  { key: "ERISIM_ZORUNLULUK", label: "Erişim Zorunluluk" },
] as const;

export const CUSTOM_PROJECT_TYPE_KEYS = [
  "custom_1",
  "custom_2",
  "custom_3",
  "custom_4",
] as const;

export type FixedProjectTypeKey = (typeof FIXED_PROJECT_TYPES)[number]["key"];
export type CustomProjectTypeKey = (typeof CUSTOM_PROJECT_TYPE_KEYS)[number];

export const PROJECT_STATUSES = [
  {
    value: "waiting",
    label: "Başlamadı",
    dateKey: "waiting_at" as const,
    color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
  {
    value: "in_progress",
    label: "Devam Ediyor",
    dateKey: "in_progress_at" as const,
    color: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  {
    value: "excavation_permit_waiting",
    label: "Kazı İzni Bekliyor",
    dateKey: "excavation_permit_waiting_at" as const,
    color: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  {
    value: "delayed",
    label: "Devam Ediyor · Gecikmiş",
    dateKey: "delayed_at" as const,
    color: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  },
  {
    value: "completed",
    label: "Bitti",
    dateKey: "completed_at" as const,
    dateLabel: "Bitiş Tarihi",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number]["value"];
export type StageDateKey = (typeof PROJECT_STATUSES)[number]["dateKey"];

export const AUTOMATIC_PROJECT_STATUSES = PROJECT_STATUSES.filter((status) =>
  ["waiting", "excavation_permit_waiting", "in_progress", "completed"].includes(status.value)
);

export const CABLE_OPTIONS = [
  { value: "true", label: "Kablo çekildi" },
  { value: "false", label: "Kablo çekilmedi" },
] as const;

export const OBK_OPTIONS = [
  { value: "true", label: "OBK çekildi" },
  { value: "false", label: "OBK çekilmedi" },
] as const;

export const JOINT_OPTIONS = [
  { value: "true", label: "Ek yapıldı" },
  { value: "false", label: "Ek yapılmadı" },
] as const;

export const DEFAULT_CUSTOM_PROJECT_TYPES: Record<CustomProjectTypeKey, string> =
  {
    custom_1: "Özel Kategori 1",
    custom_2: "Özel Kategori 2",
    custom_3: "Özel Kategori 3",
    custom_4: "Özel Kategori 4",
  };

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

export function isBfOrGfProject(projectType: string): boolean {
  return projectType === "BF" || projectType === "GF";
}
export function isHpFocusedProject(projectType:string):boolean{return projectType==="HP_ODAKLI";}
export function isCorporateStyleProject(projectType: string): boolean {
  return projectType === "KURUMSAL_TTVPN" || projectType === "ERISIM_ZORUNLULUK";
}

export function isOngoingProjectStatus(status: string): boolean {
  return status === "in_progress";
}

export function deriveProjectStatus(project: {
  received_at: string | null;
  tracks_obk: boolean;
  obk_pulled: boolean | null;
  joint_done: boolean | null;
  cable_pulled: boolean | null;
  tracks_excavation: boolean;
  excavation_done: boolean | null;
}): ProjectStatus {
  const allRequiredStepsDone =
    project.joint_done === true &&
    project.cable_pulled === true &&
    (!project.tracks_obk || project.obk_pulled === true) &&
    (!project.tracks_excavation || project.excavation_done === true);

  if (allRequiredStepsDone) return "completed";

  if (project.received_at) {
    const receivedAt = new Date(`${project.received_at}T00:00:00`);
    const today = new Date(`${todayISODate()}T00:00:00`);
    const elapsedDays = Math.floor(
      (today.getTime() - receivedAt.getTime()) / 86_400_000
    );
    if (elapsedDays >= 30) return "delayed";
  }

  if (
    project.obk_pulled === true ||
    project.joint_done === true ||
    project.cable_pulled === true
  ) {
    return "in_progress";
  }

  return "waiting";
}

export function getStatusLabel(status: string): string {
  return PROJECT_STATUSES.find((s) => s.value === status)?.label ?? status;
}

export function getStatusColor(status: string): string {
  return (
    PROJECT_STATUSES.find((s) => s.value === status)?.color ??
    "bg-slate-100 text-slate-700"
  );
}

export function getStageDateKey(status: ProjectStatus): StageDateKey {
  return (
    PROJECT_STATUSES.find((s) => s.value === status)?.dateKey ?? "waiting_at"
  );
}

export function getStageDateLabel(status: ProjectStatus): string {
  const meta = PROJECT_STATUSES.find((s) => s.value === status);
  if (meta && "dateLabel" in meta && meta.dateLabel) return meta.dateLabel as string;
  return `${meta?.label ?? "Aşama"} Tarihi`;
}


export function formatBooleanChoice(
  value: boolean | null | undefined,
  trueLabel: string,
  falseLabel: string
): string {
  if (value === true) return trueLabel;
  if (value === false) return falseLabel;
  return "—";
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
