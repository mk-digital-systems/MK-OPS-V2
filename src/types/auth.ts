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

export type CurrencyCode = "TRY" | "USD" | "EUR";

export type CompanyAccessStatus = "trial" | "active" | "expired" | "suspended";

export type CompanySummary = {
  id: string;
  name: string;
  access_status: CompanyAccessStatus;
  trial_ends_at: string;
  plan: string | null;
  plan_ends_at: string | null;
  user_limit: number | null;
  payroll_start_day: number;
  currency_code: CurrencyCode;
  /** company-logos deposundaki dosya yolu; logo yoksa null. */
  logo_path: string | null;
  /** Yalnızca onaylı ana yöneticiye döner. */
  join_code: string | null;
};

export type AccountInfo = {
  is_super_admin: boolean;
  company: CompanySummary | null;
};

export type SignupMode = "create" | "join";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  pending: "Onay Bekliyor",
  site_chief: "Ana Yönetici",
  company_manager: "Yönetici",
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
  | "productions"
  | "hakedis";

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
  hakedis_write: boolean;
  updated_by: string | null;
  updated_at: string;
};
