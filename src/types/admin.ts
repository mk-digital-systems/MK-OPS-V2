import type { CompanyAccessStatus, UserRole } from "@/types/auth";
import type { ProjectAddon } from "@/types/project";

export type { ProjectAddon };

export type AdminCompany = {
  id: string;
  name: string;
  join_code: string;
  created_at: string;
  trial_ends_at: string;
  plan: string | null;
  plan_ends_at: string | null;
  user_limit: number | null;
  site_chief_limit: number | null;
  manager_limit: number | null;
  accounting_limit: number | null;
  /** Açılabilecek ek şube (Merkez hariç) */
  branch_limit: number;
  site_chief_count: number;
  manager_count: number;
  accounting_count: number;
  extra_branch_count: number;
  suspended_at: string | null;
  access_status: CompanyAccessStatus;
  project_addons: ProjectAddon[];
  owner_name: string | null;
  owner_email: string | null;
  approved_users: number;
  pending_users: number;
  open_requests: number;
};

export type CatalogType = {
  id: string;
  name: string;
  description: string | null;
  screen: "standard" | ProjectAddon;
  color: string | null;
  sort_order: number;
};

export type CatalogItem = {
  id?: string;
  group_name: string | null;
  poz_code: string | null;
  name: string;
  unit: string | null;
  sort_order?: number;
};

export type Catalog = {
  id: string;
  name: string;
  description: string | null;
  is_builtin: boolean;
  sort_order: number;
  types: CatalogType[];
  items: CatalogItem[];
  company_ids: string[];
};

export const SCREEN_LABELS: Record<CatalogType["screen"], string> = {
  standard: "Standart",
  hp: "HP odaklı (paftalı)",
  corporate: "Kurumsal (elle durum)",
};

export type AdminCompanyUser = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  is_approved: boolean;
  created_at: string;
};

export type SupportTopic = "plan" | "support";
export type SupportStatus = "open" | "answered" | "closed";

export type SupportRequest = {
  id: string;
  company_id: string;
  topic: SupportTopic;
  requested_plan: string | null;
  message: string;
  status: SupportStatus;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
};

export type AdminSupportRequest = SupportRequest & {
  company_name: string;
  company_access_status: CompanyAccessStatus;
  created_by_name: string | null;
  created_by_email: string | null;
};

export const SUPPORT_TOPIC_LABELS: Record<SupportTopic, string> = {
  plan: "Plan talebi",
  support: "Destek",
};

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  open: "Yanıt bekliyor",
  answered: "Yanıtlandı",
  closed: "Kapandı",
};
