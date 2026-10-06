import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PAGE_SIZE, type StageStatus } from "@/lib/constants/project";
import type {
  PaginatedResult,
  Project,
  ProjectFilters,
  ProjectInput,
  ProjectProgressData,
  ProjectSection,
  ProjectStatus,
  ProjectType,
  StageLog,
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
  async listActiveOptions(): Promise<{ id: string; project_code: string; name: string; project_type_id: string | null }[]> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("id, project_code, name, project_type_id")
      .eq("is_cancelled", false)
      .eq("is_archived", false)
      .order("project_code");
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
      stages: [...(type.stages ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    }));
  }

  async saveType(payload: {
    id: string | null;
    name: string;
    description: string;
    has_sections: boolean;
    section_label: string;
    color: string;
    stages: { id: string | null; name: string; unit: string }[];
  }): Promise<string> {
    const { data, error } = await this.supabase.rpc("save_project_type", {
      p_id: payload.id,
      p_name: payload.name,
      p_description: payload.description,
      p_has_sections: payload.has_sections,
      p_section_label: payload.section_label,
      p_color: payload.color,
      p_stages: payload.stages.map((stage) => ({ id: stage.id, name: stage.name, unit: stage.unit })),
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
