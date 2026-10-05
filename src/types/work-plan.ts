export type Personnel = {
  id: string;
  full_name: string;
  job_title: string | null;
  phone: string | null;
  tc_identity_number: string | null;
  is_active: boolean;
  employment_start_date: string | null;
  employment_end_date: string | null;
  termination_reason: string | null;
  monthly_salary: number;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PersonnelInsert = {
  full_name: string;
  job_title?: string | null;
  phone?: string | null;
  tc_identity_number?: string | null;
  is_active?: boolean;
  employment_start_date?: string | null;
  employment_end_date?: string | null;
  termination_reason?: string | null;
  monthly_salary?: number;
  notes?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type PersonnelUpdate = Partial<PersonnelInsert>;

export type PersonnelEmploymentPeriod = {
  id: string;
  personnel_id: string;
  employment_start_date: string | null;
  employment_end_date: string;
  termination_reason: string;
  created_at: string;
};

export type WorkPlanMemberSnapshot = {
  id?: string;
  personnel_id: string | null;
  full_name: string;
  job_title: string | null;
  phone: string | null;
  is_chief: boolean;
  sort_order: number;
};

export type WorkPlanTeamSnapshot = {
  id?: string;
  sort_order: number;
  project_code: string;
  project_name: string;
  team_type: string;
  vehicle_plate: string;
  chief_personnel_id: string | null;
  chief_name: string;
  chief_phone: string;
  members: WorkPlanMemberSnapshot[];
};

export type WorkPlanAbsenceStatus = "leave" | "sick_report";

export type WorkPlanAbsenceSnapshot = {
  id?: string;
  personnel_id: string;
  full_name: string;
  status: WorkPlanAbsenceStatus;
};

export type DailyWorkPlan = {
  id: string;
  plan_date: string;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type DailyWorkPlanWithTeams = DailyWorkPlan & {
  teams: WorkPlanTeamSnapshot[];
  absences: WorkPlanAbsenceSnapshot[];
};

export type WorkPlanDraft = {
  id: string;
  plan_date: string;
  notes: string | null;
  teams: WorkPlanTeamSnapshot[];
  absences: WorkPlanAbsenceSnapshot[];
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type WorkPlanSearchHit = {
  plan_id: string;
  plan_date: string;
  team_id: string;
  project_code: string;
  project_name: string;
  team_type: string;
  vehicle_plate: string;
  chief_name: string;
  member_names: string[];
};
