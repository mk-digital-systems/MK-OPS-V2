export type ProductionDefinition = { id: string; name: string; unit: string; is_active: boolean; created_at: string; updated_at: string };

/** stage: projenin iş kalemi (projeye iş kaydı açar); extra: ek iş (fiyatlı, hakedişe dahil); note: eski serbest metin */
export type ProductionItemKind = "stage" | "extra" | "note";

export type ProductionItem = {
  id: string;
  production_item_definition_id: string | null;
  item_name_snapshot: string;
  quantity: number;
  unit_snapshot: string;
  sort_order: number;
  kind: ProductionItemKind;
  progress_id: string | null;
  stage_log_id: string | null;
};
export type ProductionJob = { id: string; project_id: string | null; project_name_snapshot: string; project_code_snapshot: string | null; source: "work_plan" | "manual"; sort_order: number; items: ProductionItem[] };
export type ProductionEntry = { id: string; work_date: string; team_leader_personnel_id: string; team_leader_name_snapshot: string; source_work_plan_id: string | null; created_at: string; updated_at: string; jobs: ProductionJob[] };

export type ProductionSaveItem = {
  kind: ProductionItemKind;
  /** Düzenlenen satırın önceki kimliği (iş kaydı ve ek iş fiyatı korunur) */
  item_id?: string;
  progress_id?: string;
  item_name?: string;
  quantity?: number;
  unit?: string;
  /** Yalnızca hakediş yetkisi olanlarda gönderilir; null fiyatı kaldırır */
  unit_price?: number | null;
  sort_order: number;
};
export type ProductionSaveJob = { project_id: string | null; project_name: string; project_code: string; sort_order: number; items: ProductionSaveItem[] };

/** İmalatta seçilebilen proje */
export type ProductionProjectOption = { id: string; project_code: string; name: string; project_type_id: string | null };

/** Projenin metrajlı iş kalemi (aşama ilerleme satırı) */
export type ProductionTarget = { progress_id: string; label: string; unit: string };
