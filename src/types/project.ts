import type {
  CustomProjectTypeKey,
  ProjectStatus,
  StageDateKey,
} from "@/lib/constants/project";

export type { ProjectStatus, CustomProjectTypeKey, StageDateKey };

export type Project = {
  id: string;
  project_code: string;
  name: string;
  project_type: string;
  location: string;
  team_name: string | null;
  description: string | null;
  image_url: string | null;
  status: ProjectStatus;
  received_at: string | null;
  start_date: string | null;
  estimated_end_date: string | null;
  waiting_at: string | null;
  in_progress_at: string | null;
  excavation_permit_waiting_at: string | null;
  delayed_at: string | null;
  completed_at: string | null;
  cable_pulled: boolean | null;
  tracks_obk: boolean;
  obk_pulled: boolean | null;
  tracks_joint: boolean;
  joint_done: boolean | null;
  tracks_cable: boolean;
  tracks_excavation: boolean;
  excavation_done: boolean | null;
  progress_notes: string | null;
  is_archived: boolean;
  archived_at: string | null;
  is_cancelled: boolean;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  sheet_count: number | null;
  hp_count: number | null;
  is_single_sheet: boolean;
  matching_team_leaders?: string[];
  sheet_numbers?: string[];
  sheet_summaries?: Array<{ id: string; sheet_no: string }>;
  matched_sheets?: Array<{ id: string; sheet_no: string | null; address: string | null }>;
  progress_percent: number;
  project_date: string | null;
  priority_order: number | null;
  status_sort_order: number;
  project_type_sort_order: number;
  default_status_sort_order: number;
  completed_by_personnel_id: string | null;
  completed_by_name: string | null;
  current_team_leader_personnel_id: string | null;
  current_team_leader_name: string | null;
  cancellation_history?: Array<{
    id: string;
    reason: string;
    cancelled_at: string;
    reactivated_at: string | null;
  }>;
};

export type ProjectInsert = {
  project_code: string;
  name: string;
  project_type: string;
  location: string;
  description?: string | null;
  image_url?: string | null;
  received_at?: string | null;
  tracks_obk?: boolean;
  tracks_excavation?: boolean;
  tracks_cable?: boolean;
  tracks_joint?: boolean;
  sheet_count?: number | null;
  hp_count?: number | null;
  is_single_sheet?: boolean;
  cabinet_counts?: Partial<Record<CabinetType, number>>;
  cabinet_sd_codes?: Partial<Record<CabinetType, string[]>>;
  initial_sheets?: Array<{ sheet_no:string; address:string|null; hp_count:number; notes:string|null; image_url:string|null }>;
  status?: ProjectStatus;
  project_date?: string | null;
  priority_order?: number | null;
  completed_by_personnel_id?: string | null;
  completed_by_name?: string | null;
  current_team_leader_personnel_id?: string | null;
  current_team_leader_name?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type ProjectSheetCable = { id: string; sheet_id: string; fiber_count: number; quantity: number; created_at: string };
export type ProjectSheetProgress = { id: string; sheet_id: string; cable_id: string | null; stage: "cable" | "joint" | "obk" | "excavation_permit_waiting" | "excavation_waiting" | "excavation_done" | "completed"; quantity: number; team_leader_personnel_id: string | null; team_leader_name: string; progress_date: string; notes: string | null; created_at: string };
export type HpSheetStatus="not_started"|"excavation_permit_waiting"|"in_progress"|"completed";
export type ProjectSheet = { id: string; project_id: string; name: string; sheet_no:string|null; address:string|null; notes:string|null; image_url:string|null; manual_status:HpSheetStatus; hp_count: number | null; location: string | null; coordinates: string | null; tracks_cable: boolean; tracks_joint: boolean; tracks_obk: boolean; tracks_excavation: boolean; is_completed:boolean; completed_at:string|null; completed_by_personnel_id:string|null; completed_by_name:string|null; current_team_leader_personnel_id:string|null; current_team_leader_name:string|null; created_at: string; updated_at: string; cables: ProjectSheetCable[]; progress: ProjectSheetProgress[] };
export type CabinetType = "T7" | "T9" | "T11" | "T21" | "T23";
export type CabinetStage = "cable" | "excavation_permit_waiting" | "excavation_waiting" | "excavation_done" | "energy_cable" | "energy" | "cabinet_installation" | "joint" | "transfer";
export type ProjectCabinetProgress = { id:string; cabinet_id:string; stage:CabinetStage; cable_info:string|null; energy_cable_info:string|null; transfer_info:string|null; team_leader_personnel_id:string|null; team_leader_name:string; progress_date:string; notes:string|null; created_at:string };
export type ProjectCabinet = { id:string; project_id:string; cabinet_type:CabinetType; cabinet_no:number; name:string; sd_code:string|null; location:string|null; coordinates:string|null; tracks_excavation:boolean; is_completed:boolean; completed_at:string|null; created_at:string; progress:ProjectCabinetProgress[] };

export type ProjectUpdate = {
  project_code?: string;
  name?: string;
  project_type?: string;
  location?: string;
  description?: string | null;
  image_url?: string | null;
  received_at?: string | null;
  status?: ProjectStatus;
  waiting_at?: string | null;
  in_progress_at?: string | null;
  excavation_permit_waiting_at?: string | null;
  delayed_at?: string | null;
  completed_at?: string | null;
  cable_pulled?: boolean | null;
  tracks_obk?: boolean;
  obk_pulled?: boolean | null;
  tracks_joint?: boolean;
  joint_done?: boolean | null;
  tracks_cable?: boolean;
  tracks_excavation?: boolean;
  excavation_done?: boolean | null;
  progress_notes?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
  project_date?: string | null;
  priority_order?: number | null;
  completed_by_personnel_id?: string | null;
  completed_by_name?: string | null;
  current_team_leader_personnel_id?: string | null;
  current_team_leader_name?: string | null;
  updated_by?: string | null;
};

export type CustomProjectTypes = Record<CustomProjectTypeKey, string>;

export type DashboardStats = {
  total: number;
  waiting: number;
  in_progress: number;
  excavation_permit_waiting: number;
  delayed: number;
  completed: number;
  archived: number;
};

export type ProjectAnalysisStage =
  | "not_started"
  | "in_progress"
  | "obk_waiting"
  | "excavation_waiting"
  | "cable_waiting"
  | "completed"
  | "delayed";

export type DashboardCategoryAnalysis = {
  category: string;
  label?: string;
  unit_label?: string;
  subcategories?: Array<{ label: string; count: number }>;
  total: number;
  not_started: number;
  in_progress: number;
  obk_waiting: number;
  excavation_waiting: number;
  cable_waiting: number;
  completed: number;
  delayed: number;
};

export type DashboardCriticalStats = {
  delayed: number;
  excavation_waiting: number;
  obk_waiting: number;
  cable_waiting: number;
};

export type DashboardOverview = {
  stats: DashboardStats;
  categories: DashboardCategoryAnalysis[];
  critical: DashboardCriticalStats;
  recently_updated: Project[];
  recently_created: Project[];
};

export type ProjectFilters = {
  search?: string;
  status?: ProjectStatus | "all";
  projectType?: string | "all";
  location?: string | "all";
  obkStatus?: TrackingFilter;
  jointStatus?: TrackingFilter;
  cableStatus?: TrackingFilter;
  excavationStatus?: ExcavationTrackingFilter;
  analysisStage?: ProjectAnalysisStage;
  archiveScope?: "active" | "archived" | "cancelled" | "all";
  page?: number;
  pageSize?: number;
  sortBy?: "updated_at" | "created_at" | "name" | "project_code" | "status";
  sortOrder?: "asc" | "desc";
};

export type TrackingFilter =
  | "all"
  | "tracked"
  | "untracked"
  | "true"
  | "false";

export type ExcavationTrackingFilter = TrackingFilter | "permit_waiting" | "excavation_waiting" | "done";

export type ProjectTrackingUpdate = {
  id: string;
  tracks_obk: boolean;
  obk_pulled: boolean | null;
  tracks_joint: boolean;
  joint_done: boolean | null;
  tracks_cable: boolean;
  cable_pulled: boolean | null;
  tracks_excavation: boolean;
  excavation_done: boolean | null;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
