export type AuditAction = "insert" | "update" | "delete";

export type AuditModule =
  | "projects"
  | "hakedis"
  | "personnel"
  | "vehicles"
  | "inventory"
  | "work_plans"
  | "productions"
  | "users"
  | "settings";

export type AuditLog = {
  id: number;
  created_at: string;
  actor_user_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  module: AuditModule;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  action: AuditAction;
  /** update: { alan: { old, new } }, insert/delete: { alan: değer } */
  changes: Record<string, unknown>;
};

export type AuditFilters = {
  from: string;
  to: string;
  module: AuditModule | null;
  actor: string | null;
  page: number;
};

export type AuditActor = { id: string; name: string };
