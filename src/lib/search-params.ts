import type {
  ProjectAnalysisStage,
  ProjectFilters,
  ProjectStatus,
  TrackingFilter,
  ExcavationTrackingFilter,
} from "@/types/project";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants/project";

export function parseProjectSearchParams(
  params: Record<string, string | string[] | undefined>,
  defaults?: Partial<ProjectFilters>
): ProjectFilters {
  const get = (key: string) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };

  const page = Number(get("page") ?? defaults?.page ?? 1);
  const pageSize = Number(
    get("pageSize") ?? defaults?.pageSize ?? DEFAULT_PAGE_SIZE
  );

  return {
    search: get("q") ?? defaults?.search,
    status:
      (get("status") as ProjectStatus | "all" | undefined) ??
      defaults?.status ??
      "all",
    projectType: get("type") ?? defaults?.projectType ?? "all",
    location: get("location") ?? defaults?.location ?? "all",
    obkStatus:
      (get("obk") as TrackingFilter | undefined) ??
      defaults?.obkStatus ??
      "all",
    jointStatus:
      (get("joint") as TrackingFilter | undefined) ??
      defaults?.jointStatus ??
      "all",
    cableStatus:
      (get("cable") as TrackingFilter | undefined) ??
      defaults?.cableStatus ??
      "all",
    excavationStatus:
      (get("excavation") as ExcavationTrackingFilter | undefined) ??
      defaults?.excavationStatus ??
      "all",
    analysisStage:
      (get("stage") as ProjectAnalysisStage | undefined) ??
      defaults?.analysisStage,
    archiveScope:
      (get("scope") as "active" | "archived" | "cancelled" | "all" | undefined) ??
      defaults?.archiveScope ??
      "active",
    page: Number.isFinite(page) && page > 0 ? page : 1,
    pageSize:
      Number.isFinite(pageSize) && pageSize > 0 ? pageSize : DEFAULT_PAGE_SIZE,
    sortBy: defaults?.sortBy ?? "updated_at",
    sortOrder: defaults?.sortOrder ?? "desc",
  };
}
