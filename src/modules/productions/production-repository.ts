import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductionEntry, ProductionJobOptions, ProductionProjectOption, ProductionSaveJob, ProductionTarget } from "@/types/production";
import { stageLabel } from "@/lib/constants/project";

export class ProductionRepository {
  constructor(private readonly supabase: SupabaseClient) {}
  async listEntries(from: string, to: string, branchId?: string | null): Promise<ProductionEntry[]> {
    let query = this.supabase.from("production_entries").select(`*, production_jobs(*, production_items(*))`).gte("work_date", from).lte("work_date", to).order("work_date", { ascending: false });
    if (branchId) query = query.eq("branch_id", branchId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((entry) => ({ ...entry, jobs: [...(entry.production_jobs ?? [])].sort((a,b) => a.sort_order-b.sort_order).map((job) => ({ ...job, items: [...(job.production_items ?? [])].sort((a,b) => a.sort_order-b.sort_order) })) })) as ProductionEntry[];
  }
  async saveEntry(input: { entry_id?: string | null; work_date: string; leader_id: string; leader_name: string; work_plan_id: string | null; jobs: ProductionSaveJob[] }): Promise<string> {
    const { data, error } = await this.supabase.rpc("save_production_entry", { p_entry_id: input.entry_id ?? null, p_work_date: input.work_date, p_team_leader_personnel_id: input.leader_id, p_team_leader_name: input.leader_name, p_source_work_plan_id: input.work_plan_id, p_jobs: input.jobs });
    if (error) throw error; return data as string;
  }
  /** İmalatta seçilebilen projeler: iptal ve arşiv dışı. */
  async listProjectOptions(branchId?: string | null): Promise<ProductionProjectOption[]> {
    let query = this.supabase.from("projects").select("id, project_code, name, project_type_id, branch_id")
      .eq("is_cancelled", false).eq("is_archived", false).order("project_code");
    if (branchId) query = query.eq("branch_id", branchId);
    const { data, error } = await query;
    if (error) throw error; return (data ?? []) as ProductionProjectOption[];
  }
  /**
   * Proje seçilince: kalemler ve paftalar. Katalog türünde (poz projesi) kataloğun aktif pozları listelenir;
   * projede satırı olmayan poz "poz:<kimlik>" değeriyle gelir (imalatla açılır).
   */
  async listJobOptions(projectId: string): Promise<ProductionJobOptions> {
    const { data: project, error } = await this.supabase
      .from("projects")
      .select("id, type:project_types(screen, catalog:catalog_project_types(catalog_id))")
      .eq("id", projectId)
      .maybeSingle();
    if (error) throw error;
    const type = (project?.type ?? null) as unknown as { screen: string; catalog: { catalog_id: string } | null } | null;
    const [rowTargets, sheets] = await Promise.all([
      this.listTargets(projectId),
      type?.screen === "hp"
        ? this.supabase.from("project_hp_sheets").select("id, sheet_no").eq("project_id", projectId).order("sort_order")
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (sheets.error) throw sheets.error;
    const catalogId = type?.catalog?.catalog_id;
    let targets = rowTargets;
    if (catalogId) {
      const { data: pozes, error: pozError } = await this.supabase
        .from("project_type_stages")
        .select("id, name, unit, poz_code, sort_order")
        .is("project_type_id", null)
        .eq("catalog_id", catalogId)
        .eq("is_active", true)
        .not("unit", "is", null)
        .order("sort_order");
      if (pozError) throw pozError;
      const { data: rows, error: rowError } = await this.supabase
        .from("project_stage_progress")
        .select("id, stage_id")
        .eq("project_id", projectId)
        .is("section_id", null);
      if (rowError) throw rowError;
      const rowByStage = new Map((rows ?? []).map((row) => [row.stage_id as string, row.id as string]));
      const fromPozes = (pozes ?? []).map((item) => ({
        progress_id: rowByStage.get(item.id as string) ?? `poz:${item.id}`,
        label: stageLabel(item as { name: string; poz_code: string | null }),
        unit: item.unit as string,
      }));
      // Pasife alınmış ama projede kullanılmış pozlar da (eski imalatlar düzenlenebilsin) listede kalır.
      const listed = new Set(fromPozes.map((target) => target.progress_id));
      targets = [...fromPozes, ...rowTargets.filter((target) => !listed.has(target.progress_id))];
    }
    return { targets, sheets: (sheets.data ?? []) as { id: string; sheet_no: string }[] };
  }

  /** Projenin metrajlı iş kalemleri (bölümlüyse "Bölüm · Kalem"; projeye özel kalemler dahil). */
  async listTargets(projectId: string): Promise<ProductionTarget[]> {
    type StageRow = { name: string; unit: string | null; sort_order: number; poz_code: string | null };
    const [{ data: rows, error }, { data: sections, error: sectionError }, { data: order, error: orderError }] = await Promise.all([
      this.supabase.from("project_stage_progress").select("id, section_id, stage_id, stage:project_type_stages(name, unit, sort_order, poz_code)").eq("project_id", projectId),
      this.supabase.from("project_sections").select("id, name, sort_order").eq("project_id", projectId),
      this.supabase.from("project_stages").select("stage_id, sort_order").eq("project_id", projectId),
    ]);
    if (error) throw error; if (sectionError) throw sectionError; if (orderError) throw orderError;
    const sectionById = new Map((sections ?? []).map((section) => [section.id as string, section as { name: string; sort_order: number }]));
    // Projeye göre düzenlenmiş projede sıra projenin listesinden gelir.
    const listOrder = new Map((order ?? []).map((row) => [row.stage_id as string, row.sort_order as number]));
    const position = (stageId: string, stage: StageRow) => listOrder.get(stageId) ?? stage.sort_order;
    return (rows ?? [])
      .map((row) => ({ row, stage: row.stage as unknown as StageRow | null, section: row.section_id ? sectionById.get(row.section_id as string) : undefined }))
      .filter((item) => item.stage?.unit)
      .sort((a, b) => (a.section?.sort_order ?? -1) - (b.section?.sort_order ?? -1) || (a.section?.name ?? "").localeCompare(b.section?.name ?? "", "tr") || position(a.row.stage_id as string, a.stage!) - position(b.row.stage_id as string, b.stage!))
      .map((item) => ({ progress_id: item.row.id as string, label: [item.section?.name, stageLabel(item.stage!)].filter(Boolean).join(" · "), unit: item.stage!.unit! }));
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
