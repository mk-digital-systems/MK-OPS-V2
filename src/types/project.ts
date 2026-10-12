import type { ProjectStatus, StageStatus } from "@/lib/constants/project";

export type { ProjectStatus, StageStatus };

/** standard: aşamalar; hp: pafta/HP (telekom eklentisi); corporate: sade kurumsal (telekom eklentisi) */
export type ProjectScreen = "standard" | "hp" | "corporate";
export type ProjectAddon = Exclude<ProjectScreen, "standard">;

export type ProjectTypeStage = {
  id: string;
  project_type_id: string;
  name: string;
  unit: string | null;
  sort_order: number;
  /** İsteğe bağlı 3–5 karakterlik poz kodu */
  poz_code: string | null;
  /** Doluysa kalem yalnızca bu projeye aittir */
  project_id: string | null;
};

/** template: türün bütün şablon kalemleri; custom: projeye göre düzenlenmiş liste */
export type StageMode = "template" | "custom";

/** Proje kalem listesi düzenlenirken bir satır (şablon kalemi ya da projeye özel kalem). */
export type StageListItem = {
  key: string;
  /** Şablon kaleminde veya kayıtlı projeye özel kalemde dolu; yeni özel kalemde null */
  stage_id: string | null;
  template: boolean;
  name: string;
  unit: string;
  poz_code: string;
};

export type ProjectType = {
  id: string;
  name: string;
  description: string | null;
  has_sections: boolean;
  section_label: string;
  color: string | null;
  sort_order: number;
  is_archived: boolean;
  screen: ProjectScreen;
  stages: ProjectTypeStage[];
};

export type Project = {
  id: string;
  project_code: string;
  name: string;
  project_type_id: string;
  location: string;
  team_name: string | null;
  description: string | null;
  branch_id: string;
  image_url: string | null;
  status: ProjectStatus;
  hold_reason: string | null;
  has_activity: boolean;
  received_at: string | null;
  start_date: string | null;
  estimated_end_date: string | null;
  waiting_at: string | null;
  in_progress_at: string | null;
  on_hold_at: string | null;
  delayed_at: string | null;
  completed_at: string | null;
  progress_notes: string | null;
  progress_percent: number;
  stage_mode: StageMode;
  priority_order: number | null;
  is_archived: boolean;
  archived_at: string | null;
  is_cancelled: boolean;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  completed_by_name: string | null;
  current_team_leader_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectSection = {
  id: string;
  project_id: string;
  name: string;
  location: string | null;
  coordinates: string | null;
  notes: string | null;
  sort_order: number;
};

export type StageProgress = {
  id: string;
  project_id: string;
  section_id: string | null;
  stage_id: string;
  status: StageStatus;
  target_quantity: number | null;
  done_quantity: number;
  percent: number;
  started_at: string | null;
  completed_at: string | null;
};

export type StageLog = {
  id: string;
  progress_id: string;
  log_date: string;
  quantity: number | null;
  team_leader_personnel_id: string | null;
  team_leader_name: string | null;
  notes: string | null;
  /** manual: proje detayından; production: İmalatlar'dan (yalnızca orada düzenlenir) */
  source: "manual" | "production";
  created_at: string;
};

export type ProjectProgressData = {
  sections: ProjectSection[];
  progress: StageProgress[];
  logs: StageLog[];
};

export type HpSheetStatus = "not_started" | "permit_waiting" | "in_progress" | "completed";

export type HpSheet = {
  id: string;
  project_id: string;
  sheet_no: string;
  hp_count: number;
  address: string | null;
  image_url: string | null;
  notes: string | null;
  status: HpSheetStatus;
  current_team_leader_personnel_id: string | null;
  current_team_leader_name: string | null;
  completed_by_personnel_id: string | null;
  completed_by_name: string | null;
  completed_at: string | null;
  sort_order: number;
};

export type HpSheetInput = {
  sheet_no: string;
  hp_count: number;
  address: string;
  image_url: string;
  notes: string;
};

export type HpReportProject = {
  id: string;
  project_code: string;
  name: string;
  status: ProjectStatus;
  branch_id: string;
  is_archived: boolean;
  sheet_count: number;
  completed_sheets: number;
  total_hp: number;
  completed_hp: number;
  period_hp: number;
  period_sheets: number;
  last_completed_at: string | null;
};

export type HpReport = {
  totals: {
    projects: number;
    completed_projects: number;
    sheets: number;
    completed_sheets: number;
    total_hp: number;
    completed_hp: number;
    period_hp: number;
    period_sheets: number;
    period_completed_projects: number;
  };
  projects: HpReportProject[];
  period_sheets: Array<{
    id: string;
    sheet_no: string;
    hp_count: number;
    address: string | null;
    completed_at: string;
    completed_by_name: string | null;
    project_id: string;
    project_code: string;
    project_name: string;
  }>;
};

export type ArchiveScope = "active" | "archived" | "cancelled" | "all";

export type ProjectFilters = {
  search?: string;
  status?: ProjectStatus | "all";
  projectTypeId?: string | "all";
  location?: string | "all";
  archiveScope?: ArchiveScope;
  page?: number;
  pageSize?: number;
  sortBy?: "updated_at" | "created_at" | "estimated_end_date" | "project_code" | "progress_percent";
  sortOrder?: "asc" | "desc";
  /** Menüde seçili şube (yoksa erişilebilen bütün şubeler). */
  branchId?: string | null;
};

export type PaginatedResult<T> = {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type ProjectInput = {
  project_code: string;
  name: string;
  project_type_id: string;
  location: string;
  team_name?: string | null;
  description?: string | null;
  image_url?: string | null;
  received_at?: string | null;
  start_date?: string | null;
  estimated_end_date?: string | null;
  priority_order?: number | null;
  /** Verilmezse kullanıcının varsayılan şubesi (Merkez ya da ilk şubesi). */
  branch_id?: string | null;
};

export type DashboardStats = {
  total: number;
  waiting: number;
  in_progress: number;
  on_hold: number;
  delayed: number;
  completed: number;
  archived: number;
  cancelled: number;
};

export type DashboardTypeStage = {
  id: string;
  name: string;
  unit: string | null;
  done: number;
  in_progress: number;
  not_started: number;
  done_quantity: number;
};

export type DashboardTypeSummary = {
  id: string;
  name: string;
  color: string | null;
  total: number;
  waiting: number;
  in_progress: number;
  on_hold: number;
  delayed: number;
  completed: number;
  avg_progress: number;
  stages: DashboardTypeStage[];
};

export type DashboardOverview = {
  types: DashboardTypeSummary[];
  upcoming: Array<Pick<Project, "id" | "project_code" | "name" | "status" | "progress_percent" | "estimated_end_date">>;
  recent_logs: Array<{
    id: string;
    log_date: string;
    quantity: number | null;
    team_leader_name: string | null;
    notes: string | null;
    stage_name: string;
    unit: string | null;
    project_id: string;
    project_code: string;
    project_name: string;
    section_name: string | null;
  }>;
};
