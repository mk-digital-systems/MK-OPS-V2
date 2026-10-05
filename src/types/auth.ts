export type UserRole =
  | "pending"
  | "site_chief"
  | "company_manager"
  | "accounting";

export type UserProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  avatar_path: string | null;
  role: UserRole;
  is_approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CompanyAccessStatus = "trial" | "active" | "expired" | "suspended";

export type CompanySummary = {
  id: string;
  name: string;
  access_status: CompanyAccessStatus;
  trial_ends_at: string;
  plan: string | null;
  plan_ends_at: string | null;
  user_limit: number | null;
  /** Yalnızca onaylı şantiye şefine döner. */
  join_code: string | null;
};

export type AccountInfo = {
  is_super_admin: boolean;
  company: CompanySummary | null;
};

export type SignupMode = "create" | "join";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  pending: "Onay Bekliyor",
  site_chief: "Şantiye Şefi",
  company_manager: "Şirket Yöneticisi",
  accounting: "Muhasebe",
};

export type PermissionModule =
  | "projects"
  | "work_plans"
  | "personnel"
  | "attendance"
  | "vehicles"
  | "inventory"
  | "custody"
  | "productions";

export type CompanyManagerPermissions = {
  user_id: string;
  projects_write: boolean;
  work_plans_write: boolean;
  personnel_write: boolean;
  attendance_write: boolean;
  vehicles_write: boolean;
  inventory_write: boolean;
  custody_write: boolean;
  productions_write: boolean;
  updated_by: string | null;
  updated_at: string;
};
