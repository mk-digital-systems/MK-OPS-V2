import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductionEntry, ProductionProjectOption, ProductionSaveJob, ProductionTarget } from "@/types/production";
import type { ProjectType } from "@/types/project";

export class ProductionRepository {
  constructor(private readonly supabase: SupabaseClient) {}
  async listEntries(from: string, to: string): Promise<ProductionEntry[]> {
    const { data, error } = await this.supabase.from("production_entries").select(`*, production_jobs(*, production_items(*))`).gte("work_date", from).lte("work_date", to).order("work_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((entry) => ({ ...entry, jobs: [...(entry.production_jobs ?? [])].sort((a,b) => a.sort_order-b.sort_order).map((job) => ({ ...job, items: [...(job.production_items ?? [])].sort((a,b) => a.sort_order-b.sort_order) })) })) as ProductionEntry[];
  }
  async saveEntry(input: { entry_id?: string | null; work_date: string; leader_id: string; leader_name: string; work_plan_id: string | null; jobs: ProductionSaveJob[] }): Promise<string> {
    const { data, error } = await this.supabase.rpc("save_production_entry", { p_entry_id: input.entry_id ?? null, p_work_date: input.work_date, p_team_leader_personnel_id: input.leader_id, p_team_leader_name: input.leader_name, p_source_work_plan_id: input.work_plan_id, p_jobs: input.jobs });
    if (error) throw error; return data as string;
  }
  /** İmalatta seçilebilen projeler: iptal ve arşiv dışı. */
  async listProjectOptions(): Promise<ProductionProjectOption[]> {
    const { data, error } = await this.supabase.from("projects").select("id, project_code, name, project_type_id")
      .eq("is_cancelled", false).eq("is_archived", false).order("project_code");
    if (error) throw error; return (data ?? []) as ProductionProjectOption[];
  }
  /** Projenin metrajlı iş kalemleri (bölümlüyse "Bölüm · Kalem"). */
  async listTargets(projectId: string, types: ProjectType[]): Promise<ProductionTarget[]> {
    const [{ data: rows, error }, { data: sections, error: sectionError }] = await Promise.all([
      this.supabase.from("project_stage_progress").select("id, section_id, stage_id").eq("project_id", projectId),
      this.supabase.from("project_sections").select("id, name, sort_order").eq("project_id", projectId),
    ]);
    if (error) throw error; if (sectionError) throw sectionError;
    const stages = new Map(types.flatMap((type) => type.stages).map((stage) => [stage.id, stage]));
    const sectionById = new Map((sections ?? []).map((section) => [section.id as string, section as { name: string; sort_order: number }]));
    return (rows ?? [])
      .map((row) => ({ row, stage: stages.get(row.stage_id as string), section: row.section_id ? sectionById.get(row.section_id as string) : undefined }))
      .filter((item) => item.stage?.unit)
      .sort((a, b) => (a.section?.sort_order ?? -1) - (b.section?.sort_order ?? -1) || (a.section?.name ?? "").localeCompare(b.section?.name ?? "", "tr") || a.stage!.sort_order - b.stage!.sort_order)
      .map((item) => ({ progress_id: item.row.id as string, label: [item.section?.name, item.stage!.name].filter(Boolean).join(" · "), unit: item.stage!.unit! }));
  }
  /** Ek iş fiyatları; yalnızca hakediş yetkisi olanlara döner (diğerlerine boş). */
  async getExtraPrices(itemIds: string[]): Promise<Record<string, number>> {
    if (!itemIds.length) return {};
    const { data, error } = await this.supabase.from("hakedis_extra_values").select("production_item_id, unit_price").in("production_item_id", itemIds);
    if (error) return {};
    return Object.fromEntries((data ?? []).map((row) => [row.production_item_id as string, Number(row.unit_price)]));
  }
  async deleteEntry(id: string) { const { error } = await this.supabase.rpc("delete_production_entry", { p_entry_id: id }); if (error) throw error; }
}
