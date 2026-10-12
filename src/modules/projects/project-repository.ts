import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PAGE_SIZE, type StageStatus } from "@/lib/constants/project";
import type {
  CorporateStatus,
  HpReport,
  HpSheet,
  HpSheetInput,
  HpSheetStatus,
  PaginatedResult,
  Project,
  ProjectFilters,
  ProjectAddon,
  ProjectInput,
  ProjectProgressData,
  ProjectSection,
  ProjectStatus,
  ProjectType,
  ProjectTypeStage,
  StageListItem,
  StageLog,
  StageMode,
  StageProgress,
} from "@/types/project";

const emptyToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export class ProjectRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // ---------------------------------------------------------------- projeler
  async list(filters: ProjectFilters = {}): Promise<PaginatedResult<Project>> {
    const { error: refreshError } = await this.supabase.rpc("refresh_overdue_project_statuses");
    if (refreshError && refreshError.code !== "PGRST202") throw refreshError;

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;

    let query = this.supabase.from("projects").select("*", { count: "exact" });

    const scope = filters.archiveScope ?? "active";
    if (scope === "active") query = query.eq("is_archived", false).eq("is_cancelled", false);
    else if (scope === "archived") query = query.eq("is_archived", true).eq("is_cancelled", false);
    else if (scope === "cancelled") query = query.eq("is_cancelled", true);
    else query = query.eq("is_cancelled", false);

    if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
    if (filters.projectTypeId && filters.projectTypeId !== "all") query = query.eq("project_type_id", filters.projectTypeId);
    if (filters.location && filters.location !== "all") query = query.eq("location", filters.location);
    if (filters.branchId) query = query.eq("branch_id", filters.branchId);

    const search = filters.search?.trim().replace(/[%,()]/g, " ");
    if (search) {
      const pattern = `%${search}%`;
      query = query.or(
        `project_code.ilike.${pattern},name.ilike.${pattern},location.ilike.${pattern},team_name.ilike.${pattern},description.ilike.${pattern}`
      );
    }

    query = query
      .order("priority_order", { ascending: true, nullsFirst: false })
      .order(filters.sortBy ?? "updated_at", { ascending: (filters.sortOrder ?? "desc") === "asc" })
      .range(from, from + pageSize - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    const total = count ?? 0;
    return {
      data: (data ?? []) as Project[],
      count: total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(id: string): Promise<Project | null> {
    const { data, error } = await this.supabase.from("projects").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data as Project | null;
  }

  private toRow(payload: ProjectInput) {
    return {
      project_code: payload.project_code.trim(),
      name: payload.name.trim(),
      project_type_id: payload.project_type_id,
      location: payload.location.trim(),
      team_name: emptyToNull(payload.team_name),
      description: emptyToNull(payload.description),
      image_url: emptyToNull(payload.image_url),
      received_at: emptyToNull(payload.received_at),
      start_date: emptyToNull(payload.start_date),
      estimated_end_date: emptyToNull(payload.estimated_end_date),
      priority_order: payload.priority_order ?? null,
      ...(payload.project_date !== undefined ? { project_date: emptyToNull(payload.project_date) } : {}),
      ...(payload.branch_id ? { branch_id: payload.branch_id } : {}),
    };
  }

  async create(payload: ProjectInput, userId: string): Promise<Project> {
    const { data, error } = await this.supabase
      .from("projects")
      .insert({ ...this.toRow(payload), created_by: userId, updated_by: userId })
      .select("*")
      .single();
    if (error) throw error;
    return data as Project;
  }

  /** HP odaklı projeyi paftalarıyla birlikte tek işlemde açar. */
  async createHpProject(payload: ProjectInput, sheets: HpSheetInput[]): Promise<string> {
    const { data, error } = await this.supabase.rpc("create_hp_project", {
      p_project: this.toRow(payload),
      p_sheets: sheets.map((sheet) => ({
        sheet_no: sheet.sheet_no.trim(),
        hp_count: sheet.hp_count,
        address: emptyToNull(sheet.address),
        image_url: emptyToNull(sheet.image_url),
        notes: emptyToNull(sheet.notes),
      })),
    });
    if (error) throw error;
    return data as string;
  }

  async update(id: string, payload: ProjectInput, userId: string): Promise<Project> {
    const { data, error } = await this.supabase
      .from("projects")
      .update({ ...this.toRow(payload), updated_by: userId })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as Project;
  }

  /** Beklemeye al, otomatik duruma döndür veya elle tamamla. */
  async setStatus(id: string, status: ProjectStatus, holdReason?: string | null): Promise<Project> {
    const { data, error } = await this.supabase
      .from("projects")
      .update({ status, hold_reason: status === "on_hold" ? emptyToNull(holdReason) : null })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as Project;
  }

  /** Kurumsal projenin elle seçilen durumu (ekip başı ve bitiş tarihiyle). */
  async setCorporateStatus(
    id: string,
    payload: { status: CorporateStatus; leader: { id: string; name: string } | null; completedAt: string | null }
  ): Promise<void> {
    const { error } = await this.supabase.rpc("set_corporate_project_status", {
      p_project_id: id,
      p_status: payload.status,
      p_leader_id: payload.leader?.id ?? null,
      p_leader_name: payload.leader?.name ?? null,
      p_completed_at: payload.completedAt,
    });
    if (error) throw error;
  }

  async setArchived(id: string, archived: boolean): Promise<Project> {
    const { data, error } = await this.supabase
      .from("projects")
      .update({ is_archived: archived, archived_at: archived ? new Date().toISOString() : null })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as Project;
  }

  async cancel(id: string, reason: string): Promise<Project> {
    const { data, error } = await this.supabase.rpc("cancel_project", { p_project_id: id, p_reason: reason });
    if (error) throw error;
    return data as Project;
  }

  async reactivate(id: string): Promise<Project> {
    const { data, error } = await this.supabase.rpc("reactivate_cancelled_project", { p_project_id: id });
    if (error) throw error;
    return data as Project;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
  }

  async getDistinctLocations(): Promise<string[]> {
    const { data, error } = await this.supabase.from("projects").select("location").order("location");
    if (error) throw error;
    return [...new Set((data ?? []).map((row) => row.location as string))];
  }

  async getLocationSuggestions(query = "", limit = 20): Promise<string[]> {
    const { data, error } = await this.supabase.rpc("get_location_suggestions", { p_query: query, p_limit: limit });
    if (error) throw error;
    return ((data as { value: string }[] | null) ?? []).map((row) => row.value);
  }

  // ---------------------------------------------------------------- türler
  /** Seçim listeleri için aktif projeler (iptal ve arşiv dışı). */
  async listActiveOptions(branchId?: string | null): Promise<{ id: string; project_code: string; name: string; project_type_id: string | null }[]> {
    let query = this.supabase
      .from("projects")
      .select("id, project_code, name, project_type_id")
      .eq("is_cancelled", false)
      .eq("is_archived", false)
      .order("project_code");
    if (branchId) query = query.eq("branch_id", branchId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async listTypes(includeArchived = false): Promise<ProjectType[]> {
    let query = this.supabase
      .from("project_types")
      .select("*, stages:project_type_stages(*)")
      .order("sort_order")
      .order("name");
    if (!includeArchived) query = query.eq("is_archived", false);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as ProjectType[]).map((type) => ({
      ...type,
      // HP migration'ı kurulmadan önce sütun yoktur: standart say.
      screen: type.screen ?? "standard",
      // Türün şablon kalemleri; projeye özel kalemler getProjectStages ile gelir.
      stages: [...(type.stages ?? [])].filter((stage) => !stage.project_id).sort((a, b) => a.sort_order - b.sort_order),
    }));
  }

  async saveType(payload: {
    id: string | null;
    name: string;
    description: string;
    has_sections: boolean;
    section_label: string;
    color: string;
    stages: { id: string | null; name: string; unit: string; poz_code: string }[];
  }): Promise<string> {
    const { data, error } = await this.supabase.rpc("save_project_type", {
      p_id: payload.id,
      p_name: payload.name,
      p_description: payload.description,
      p_has_sections: payload.has_sections,
      p_section_label: payload.section_label,
      p_color: payload.color,
      p_stages: payload.stages.map((stage) => ({ id: stage.id, name: stage.name, unit: stage.unit, poz_code: stage.poz_code })),
    });
    if (error) throw error;
    return data as string;
  }

  /** HP odaklı / kurumsal tür (aşamasız; eklenti süper admin tarafından açılır). */
  async saveAddonType(payload: { id: string | null; name: string; description: string; color: string; screen: ProjectAddon }): Promise<string> {
    const { data, error } = await this.supabase.rpc("save_addon_project_type", {
      p_id: payload.id,
      p_name: payload.name,
      p_description: payload.description,
      p_color: payload.color,
      p_screen: payload.screen,
    });
    if (error) throw error;
    return data as string;
  }

  async setTypeArchived(id: string, archived: boolean): Promise<void> {
    const { error } = await this.supabase.from("project_types").update({ is_archived: archived }).eq("id", id);
    if (error) throw error;
  }

  async deleteType(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("delete_project_type", { p_id: id });
    if (error) throw error;
  }

  /** Projenin sıralı kalemleri: düzenlenmişse projenin listesi, değilse türün şablon kalemleri. */
  async getProjectStages(project: Pick<Project, "id" | "stage_mode">, type: ProjectType): Promise<ProjectTypeStage[]> {
    if (project.stage_mode !== "custom") return type.stages;
    const { data, error } = await this.supabase
      .from("project_stages")
      .select("sort_order, stage:project_type_stages(*)")
      .eq("project_id", project.id)
      .order("sort_order");
    if (error) throw error;
    return (data ?? []).map((row) => row.stage as unknown as ProjectTypeStage).filter(Boolean);
  }

  /** template: şablondaki bütün kalemler; custom: verilen sıralı liste (şablondan seçilen + projeye özel). */
  async saveProjectStages(projectId: string, mode: StageMode, items: StageListItem[]): Promise<void> {
    const { error } = await this.supabase.rpc("save_project_stages", {
      p_project_id: projectId,
      p_mode: mode,
      p_items:
        mode === "custom"
          ? items.map((item) =>
              item.template
                ? { stage_id: item.stage_id }
                : { stage_id: item.stage_id, name: item.name.trim(), unit: item.unit.trim(), poz_code: item.poz_code.trim() }
            )
          : [],
    });
    if (error) throw error;
  }

  // ---------------------------------------------------------------- HP paftaları
  async getHpSheets(projectId: string): Promise<HpSheet[]> {
    const { data, error } = await this.supabase
      .from("project_hp_sheets")
      .select("*")
      .eq("project_id", projectId)
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as HpSheet[];
  }

  async addHpSheet(projectId: string, sheet: HpSheetInput, sortOrder: number): Promise<void> {
    const { error } = await this.supabase.from("project_hp_sheets").insert({
      project_id: projectId,
      sheet_no: sheet.sheet_no.trim(),
      hp_count: sheet.hp_count,
      address: emptyToNull(sheet.address),
      image_url: emptyToNull(sheet.image_url),
      notes: emptyToNull(sheet.notes),
      sort_order: sortOrder,
    });
    if (error) throw error;
  }

  async updateHpSheet(
    id: string,
    payload: HpSheetInput & {
      status: HpSheetStatus;
      leader: { id: string; name: string } | null;
      completed_at: string | null;
    }
  ): Promise<void> {
    const { error } = await this.supabase
      .from("project_hp_sheets")
      .update({
        sheet_no: payload.sheet_no.trim(),
        hp_count: payload.hp_count,
        address: emptyToNull(payload.address),
        image_url: emptyToNull(payload.image_url),
        notes: emptyToNull(payload.notes),
        status: payload.status,
        // Veritabanı duruma uymayan ekip başı / bitiş alanlarını temizler.
        current_team_leader_personnel_id: payload.leader?.id ?? null,
        current_team_leader_name: payload.leader?.name ?? null,
        completed_by_personnel_id: payload.leader?.id ?? null,
        completed_by_name: payload.leader?.name ?? null,
        completed_at: payload.completed_at,
      })
      .eq("id", id);
    if (error) throw error;
  }

  async deleteHpSheet(id: string): Promise<void> {
    const { error } = await this.supabase.from("project_hp_sheets").delete().eq("id", id);
    if (error) throw error;
  }

  /** Dönem: paftanın bitiş tarihi (dahil). Şube verilmezse erişilebilen bütün şubeler. */
  async getHpReport(from: string, to: string, branchId?: string | null): Promise<HpReport> {
    const { data, error } = await this.supabase.rpc("hp_report", { p_from: from, p_to: to, p_branch_id: branchId ?? null });
    if (error) throw error;
    return data as HpReport;
  }

  // ---------------------------------------------------------------- ilerleme
  async getProgress(projectId: string): Promise<ProjectProgressData> {
    const [sections, progress] = await Promise.all([
      this.supabase.from("project_sections").select("*").eq("project_id", projectId).order("sort_order").order("created_at"),
      this.supabase.from("project_stage_progress").select("*").eq("project_id", projectId),
    ]);
    if (sections.error) throw sections.error;
    if (progress.error) throw progress.error;
    const progressRows = (progress.data ?? []) as StageProgress[];
    const ids = progressRows.map((row) => row.id);
    let logs: StageLog[] = [];
    if (ids.length) {
      const { data, error } = await this.supabase
        .from("project_stage_logs")
        .select("*")
        .in("progress_id", ids)
        .order("log_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      logs = (data ?? []) as StageLog[];
    }
    return { sections: (sections.data ?? []) as ProjectSection[], progress: progressRows, logs };
  }

  async addSection(projectId: string, payload: { name: string; location?: string; notes?: string }): Promise<void> {
    const { error } = await this.supabase.from("project_sections").insert({
      project_id: projectId,
      name: payload.name.trim(),
      location: emptyToNull(payload.location),
      notes: emptyToNull(payload.notes),
    });
    if (error) throw error;
  }

  async updateSection(id: string, payload: { name: string; location?: string; notes?: string }): Promise<void> {
    const { error } = await this.supabase
      .from("project_sections")
      .update({ name: payload.name.trim(), location: emptyToNull(payload.location), notes: emptyToNull(payload.notes) })
      .eq("id", id);
    if (error) throw error;
  }

  async deleteSection(id: string): Promise<void> {
    const { error } = await this.supabase.from("project_sections").delete().eq("id", id);
    if (error) throw error;
  }

  async updateStage(id: string, payload: { status?: StageStatus; target_quantity?: number | null }): Promise<void> {
    const { error } = await this.supabase.from("project_stage_progress").update(payload).eq("id", id);
    if (error) throw error;
  }

  async addLog(payload: {
    progress_id: string;
    log_date: string;
    quantity: number | null;
    team_leader_personnel_id: string | null;
    team_leader_name: string | null;
    notes: string | null;
  }): Promise<void> {
    const { error } = await this.supabase.from("project_stage_logs").insert(payload);
    if (error) throw error;
  }

  async deleteLog(id: string): Promise<void> {
    const { error } = await this.supabase.from("project_stage_logs").delete().eq("id", id);
    if (error) throw error;
  }
}
