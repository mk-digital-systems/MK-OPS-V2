export type ProductionDefinition = { id: string; name: string; unit: string; is_active: boolean; created_at: string; updated_at: string };
export type ProductionItem = { id: string; production_item_definition_id: string | null; item_name_snapshot: string; quantity: number; unit_snapshot: string; sort_order: number };
export type ProductionJob = { id: string; project_id: string | null; project_name_snapshot: string; project_code_snapshot: string | null; source: "work_plan" | "manual"; sort_order: number; items: ProductionItem[] };
export type ProductionEntry = { id: string; work_date: string; team_leader_personnel_id: string; team_leader_name_snapshot: string; source_work_plan_id: string | null; created_at: string; updated_at: string; jobs: ProductionJob[] };
export type ProductionSaveJob = { project_id: null; project_name: string; project_code: string; source: "manual"; sort_order: number; items: { item_name: string; quantity: number; unit: string; sort_order: number }[] };
