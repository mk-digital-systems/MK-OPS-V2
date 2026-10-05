import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_PAGE_SIZE,
  getStageDateKey,
  isCorporateStyleProject,
} from "@/lib/constants/project";
import type {
  PaginatedResult,
  Project,
  ProjectFilters,
  ProjectInsert,
  ProjectTrackingUpdate,
  ProjectUpdate,
  ProjectSheet,
  ProjectCabinet,
} from "@/types/project";

function emptyToNull(value?: string | null): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  return value;
}

export class ProjectRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(filters: ProjectFilters = {}): Promise<PaginatedResult<Project>> {
    const { error: refreshError } = await this.supabase.rpc(
      "refresh_overdue_project_statuses"
    );
    if (refreshError && refreshError.code !== "PGRST202") throw refreshError;

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const sortBy = filters.sortBy ?? "updated_at";
    const ascending = (filters.sortOrder ?? "desc") === "asc";

    let query = this.supabase.from("projects").select("*", { count: "exact" });
    const matchedSheetsByProject = new Map<string, Array<{ id: string; sheet_no: string | null; address: string | null }>>();

    const scope = filters.archiveScope ?? "active";
    if (scope === "active") {
      query = query.eq("is_archived", false).eq("is_cancelled", false);
    } else if (scope === "archived") {
      query = query.eq("is_archived", true).eq("is_cancelled", false);
    } else if (scope === "cancelled") {
      query = query.eq("is_cancelled", true);
    } else {
      query = query.eq("is_cancelled", false);
    }

    if (filters.analysisStage) {
      switch (filters.analysisStage) {
        case "not_started":
          query = query.eq("status", "waiting");
          break;
        case "completed":
          query = query.eq("status", "completed");
          break;
        case "delayed":
          query = query.eq("status", "delayed");
          break;
        case "excavation_waiting":
          query = query
            .eq("tracks_excavation", true)
            .not("excavation_done", "is", true);
          break;
        case "obk_waiting":
          query = query
            .eq("status", "in_progress")
            .eq("tracks_obk", true)
            .not("obk_pulled", "is", true)
            .or("tracks_excavation.eq.false,excavation_done.eq.true");
          break;
        case "cable_waiting":
          query = query
            .eq("status", "in_progress")
            .eq("cable_pulled", false)
            .or("tracks_obk.eq.false,obk_pulled.eq.true")
            .or("tracks_excavation.eq.false,excavation_done.eq.true");
          break;
        case "in_progress":
          query = query
            .eq("status", "in_progress")
            .not("cable_pulled", "is", false)
            .or("tracks_obk.eq.false,obk_pulled.eq.true")
            .or("tracks_excavation.eq.false,excavation_done.eq.true");
          break;
      }
    } else if (filters.status && filters.status !== "all") {
      query = query.eq("status", filters.status);
    }

    if (filters.projectType && filters.projectType !== "all") {
      query = query.eq("project_type", filters.projectType);
    }

    if (filters.projectType && isCorporateStyleProject(filters.projectType) && filters.location && filters.location !== "all") {
      query = query.eq("location", filters.location);
    }

    const applyTrackingFilter = (
      filter: ProjectFilters["obkStatus"],
      tracksField: string,
      resultField: string
    ) => {
      if (!filter || filter === "all") return;
      if (filter === "tracked") query = query.eq(tracksField, true);
      else if (filter === "untracked") query = query.eq(tracksField, false);
      else {
        query = query
          .eq(tracksField, true)
          .eq(resultField, filter === "true");
      }
    };

    applyTrackingFilter(filters.obkStatus, "tracks_obk", "obk_pulled");
    applyTrackingFilter(filters.jointStatus, "tracks_joint", "joint_done");
    applyTrackingFilter(filters.cableStatus, "tracks_cable", "cable_pulled");
    if (filters.excavationStatus && filters.excavationStatus !== "all") {
      if (filters.excavationStatus === "untracked") {
        query = query.eq("tracks_excavation", false);
      } else {
        const { data: excavationSheets, error: excavationError } = await this.supabase
          .from("project_sheets")
          .select("id, project_id, progress:project_sheet_progress(id, stage, progress_date, created_at)")
          .eq("tracks_excavation", true);
        if (excavationError) throw excavationError;
        const ids = new Set<string>();
        for (const sheet of excavationSheets ?? []) {
          const progress = (sheet.progress as { stage: string; progress_date: string; created_at: string }[])
            .filter((item) => item.stage.startsWith("excavation_"))
            .sort((a, b) => `${b.progress_date}${b.created_at}`.localeCompare(`${a.progress_date}${a.created_at}`));
          const latest = progress[0]?.stage;
          const wanted = filters.excavationStatus;
          const matches = wanted === "tracked" ||
            ((wanted === "permit_waiting" || wanted === "false") && latest === "excavation_permit_waiting") ||
            ((wanted === "excavation_waiting" || wanted === "false") && latest === "excavation_waiting") ||
            ((wanted === "done" || wanted === "true") && latest === "excavation_done");
          if (matches) ids.add(sheet.project_id as string);
        }
        query = query.in("id", ids.size ? [...ids] : ["00000000-0000-0000-0000-000000000000"]);
      }
    }

    if (filters.search?.trim()) {
      const term = filters.search.trim().replace(/[%_]/g, "\\$&");
      const { data: matchingSheets, error: matchingSheetsError } = await this.supabase
        .from("project_sheets")
        .select("id,project_id,sheet_no,address")
        .ilike("address", `%${term}%`);
      if (matchingSheetsError) throw matchingSheetsError;
      for (const sheet of matchingSheets ?? []) {
        const values = matchedSheetsByProject.get(sheet.project_id as string) ?? [];
        values.push({ id: sheet.id as string, sheet_no: sheet.sheet_no as string | null, address: sheet.address as string | null });
        matchedSheetsByProject.set(sheet.project_id as string, values);
      }
      const sheetProjectIds = [...new Set((matchingSheets ?? []).map((sheet) => sheet.project_id as string))];
      const searchParts = [
        `project_code.ilike.%${term}%`,
        `name.ilike.%${term}%`,
      ];
      if (scope === "cancelled") searchParts.push(`cancellation_reason.ilike.%${term}%`);
      if (sheetProjectIds.length) searchParts.push(`id.in.(${sheetProjectIds.join(",")})`);
      query = query.or(searchParts.join(","));
    }

    const usesDefaultProjectListOrder =
      (!filters.search || !filters.search.trim()) &&
      (!filters.status || filters.status === "all") &&
      (!filters.projectType || filters.projectType === "all") &&
      (!filters.location || filters.location === "all") &&
      (!filters.analysisStage) &&
      (!filters.obkStatus || filters.obkStatus === "all") &&
      (!filters.jointStatus || filters.jointStatus === "all") &&
      (!filters.cableStatus || filters.cableStatus === "all") &&
      (!filters.excavationStatus || filters.excavationStatus === "all") &&
      (filters.archiveScope ?? "active") === "active";

    // Completion chronology must take precedence over type and manual priority,
    // including filtered lists. Undated active projects retain their usual order.
    if (scope !== "cancelled") {
      query = query
        .order("completed_at", { ascending: false, nullsFirst: false })
        .order("archived_at", { ascending: false, nullsFirst: false });
    }

    if (usesDefaultProjectListOrder) {
      query = query
        .order("project_type_sort_order", { ascending: true })
        .order("priority_order", { ascending: true, nullsFirst: false })
        .order("default_status_sort_order", { ascending: true });
    } else {
      query = query.order("priority_order", { ascending: true, nullsFirst: false });
    }
    if (!usesDefaultProjectListOrder && filters.projectType && isCorporateStyleProject(filters.projectType)) {
      query = query.order("status_sort_order", { ascending: true });
    }
    const { data, error, count } = await query
      .order(sortBy, { ascending })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;

    const total = count ?? 0;
    const projectRows = data ?? [];
    const projectIdsOnPage = projectRows.map((project)=>project.id as string);
    const sheetNumbersByProject = new Map<string,string[]>();
    const sheetSummariesByProject = new Map<string,Array<{id:string;sheet_no:string}>>();
    if(projectIdsOnPage.length){const {data:sheetRows,error:sheetRowsError}=await this.supabase.from("project_sheets").select("id,project_id,sheet_no,name").in("project_id",projectIdsOnPage);if(sheetRowsError)throw sheetRowsError;for(const sheet of sheetRows??[]){const sheetNo=(sheet.sheet_no||sheet.name) as string;const values=sheetNumbersByProject.get(sheet.project_id as string)??[];values.push(sheetNo);sheetNumbersByProject.set(sheet.project_id as string,values);const summaries=sheetSummariesByProject.get(sheet.project_id as string)??[];summaries.push({id:sheet.id as string,sheet_no:sheetNo});sheetSummariesByProject.set(sheet.project_id as string,summaries);}}

    return {
      data: projectRows.map((project) => ({
        ...project,
        sheet_numbers: sheetNumbersByProject.get(project.id as string)??[],
        sheet_summaries: sheetSummariesByProject.get(project.id as string)??[],
        matched_sheets: matchedSheetsByProject.get(project.id as string) ?? [],
      })) as Project[],
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(id: string): Promise<Project | null> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("*, cancellation_history:project_cancellation_history(id,reason,cancelled_at,reactivated_at)")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data as Project | null;
  }

  async create(payload: ProjectInsert): Promise<Project> {
    const receivedAt =
      emptyToNull(payload.received_at) ??
      new Date().toISOString().slice(0, 10);

    const insertPayload: Record<string, unknown> = {
      project_code: payload.project_code.trim(),
      name: payload.name.trim(),
      project_type: payload.project_type,
      location: payload.location.trim(),
      description: emptyToNull(payload.description),
      image_url: emptyToNull(payload.image_url),
      status: isCorporateStyleProject(payload.project_type) ? (payload.status ?? "waiting") : "waiting",
      received_at: receivedAt,
      waiting_at: receivedAt,
      tracks_obk: payload.tracks_obk ?? false,
      tracks_excavation: payload.tracks_excavation ?? false,
      tracks_cable: payload.tracks_cable ?? true,
      tracks_joint: payload.tracks_joint ?? true,
      sheet_count: payload.sheet_count ?? null,
      hp_count: payload.hp_count ?? null,
      is_single_sheet: payload.is_single_sheet ?? false,
      created_by: payload.created_by ?? null,
      updated_by: payload.updated_by ?? null,
      project_date: emptyToNull(payload.project_date),
      priority_order: payload.priority_order ?? null,
      completed_by_personnel_id: payload.completed_by_personnel_id ?? null,
      completed_by_name: emptyToNull(payload.completed_by_name),
      current_team_leader_personnel_id: payload.current_team_leader_personnel_id ?? null,
      current_team_leader_name: emptyToNull(payload.current_team_leader_name),
    };

    if (payload.project_type === "HP_ODAKLI") {
      const { data: hpProject, error: hpProjectError } = await this.supabase
        .rpc("create_hp_project_with_sheets", { p_project: insertPayload, p_sheets: payload.initial_sheets ?? [] })
        .single();
      if (hpProjectError) throw hpProjectError;
      for (const sheet of payload.initial_sheets ?? []) {
        if (!sheet.image_url) continue;
        const { error: imageUrlError } = await this.supabase
          .from("project_sheets")
          .update({ image_url: sheet.image_url.trim() })
          .eq("project_id", (hpProject as Project).id)
          .eq("sheet_no", sheet.sheet_no.trim());
        if (imageUrlError) throw imageUrlError;
      }
      return hpProject as Project;
    }

    const { data, error } = await this.supabase
      .from("projects")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) throw error;
    const sheetCount = payload.project_type === "BGFD" || payload.project_type === "HP_ODAKLI" ? 0 :
      (payload.sheet_count ?? (payload.is_single_sheet ? 1 : 0));
    if (sheetCount > 0) {
      const sheets = Array.from({ length: sheetCount }, (_, index) => ({
        project_id: data.id,
        name: sheetCount === 1 ? "Tek Pafta" : `Pafta ${index + 1}`,
        hp_count: payload.hp_count ?? null,
        tracks_cable: payload.tracks_cable ?? true,
        tracks_joint: payload.tracks_joint ?? true,
        tracks_obk: payload.project_type === "BGFD" ? false : payload.tracks_obk ?? false,
        tracks_excavation: payload.tracks_excavation ?? false,
        created_by: payload.created_by ?? null,
      }));
      const { error: sheetError } = await this.supabase.from("project_sheets").insert(sheets);
      if (sheetError) throw sheetError;
    }
    if (payload.project_type === "BGFD" && payload.cabinet_counts) {
      const cabinetRows: Record<string, unknown>[] = [];
      for (const [cabinetType, count] of Object.entries(payload.cabinet_counts)) {
        const sdCodes = payload.cabinet_sd_codes?.[cabinetType as keyof typeof payload.cabinet_sd_codes] ?? [];
        for (let index = 1; index <= (count ?? 0); index++) cabinetRows.push({
          project_id: data.id, cabinet_type: cabinetType, cabinet_no: index,
          name: `${cabinetType} · SD ${sdCodes[index - 1]}`, sd_code: sdCodes[index - 1], tracks_excavation: payload.tracks_excavation ?? false,
          created_by: payload.created_by ?? null,
        });
      }
      if (cabinetRows.length) {
        const { error: cabinetError } = await this.supabase.from("project_cabinets").insert(cabinetRows);
        if (cabinetError) throw cabinetError;
      }
    }
    if (isCorporateStyleProject(payload.project_type)) {
      const status = payload.status ?? "waiting";
      const today = new Date().toISOString().slice(0, 10);
      const { data: corporateProject, error: corporateError } = await this.supabase
        .from("projects")
        .update({
          status,
          waiting_at: status === "waiting" ? today : null,
          in_progress_at: status === "in_progress" ? today : null,
          excavation_permit_waiting_at: status === "excavation_permit_waiting" ? today : null,
          completed_at: status === "completed" ? today : null,
          is_archived: status === "completed",
          archived_at: status === "completed" ? new Date().toISOString() : null,
        })
        .eq("id", data.id)
        .select("*")
        .single();
      if (corporateError) throw corporateError;
      return corporateProject as Project;
    }
    return data as Project;
  }

  async getSheets(projectId: string): Promise<ProjectSheet[]> {
    const { data, error } = await this.supabase.from("project_sheets")
      .select("*, cables:project_sheet_cables(*), progress:project_sheet_progress(*)")
      .eq("project_id", projectId).order("created_at");
    if (error) throw error;
    return (data ?? []) as ProjectSheet[];
  }

  async getCabinets(projectId: string): Promise<ProjectCabinet[]> {
    const { data, error } = await this.supabase.from("project_cabinets")
      .select("*, progress:project_cabinet_progress(*)")
      .eq("project_id", projectId)
      .order("cabinet_type").order("cabinet_no");
    if (error) throw error;
    return (data ?? []) as ProjectCabinet[];
  }

  async update(id: string, payload: ProjectUpdate): Promise<Project> {
    const updatePayload: Record<string, unknown> = {
      updated_by: payload.updated_by ?? null,
    };

    if (payload.project_code !== undefined)
      updatePayload.project_code = payload.project_code.trim();
    if (payload.name !== undefined) updatePayload.name = payload.name.trim();
    if (payload.project_type !== undefined)
      updatePayload.project_type = payload.project_type;
    if (payload.location !== undefined)
      updatePayload.location = payload.location.trim();
    if (payload.description !== undefined)
      updatePayload.description = emptyToNull(payload.description);
    if (payload.image_url !== undefined)
      updatePayload.image_url = emptyToNull(payload.image_url);
    if (payload.received_at !== undefined)
      updatePayload.received_at = emptyToNull(payload.received_at);
    if (payload.status !== undefined) updatePayload.status = payload.status;
    if (payload.waiting_at !== undefined)
      updatePayload.waiting_at = emptyToNull(payload.waiting_at);
    if (payload.in_progress_at !== undefined)
      updatePayload.in_progress_at = emptyToNull(payload.in_progress_at);
    if (payload.excavation_permit_waiting_at !== undefined)
      updatePayload.excavation_permit_waiting_at = emptyToNull(
        payload.excavation_permit_waiting_at
      );
    if (payload.delayed_at !== undefined)
      updatePayload.delayed_at = emptyToNull(payload.delayed_at);
    if (payload.completed_at !== undefined)
      updatePayload.completed_at = emptyToNull(payload.completed_at);
    if (payload.cable_pulled !== undefined)
      updatePayload.cable_pulled = payload.cable_pulled;
    if (payload.tracks_obk !== undefined)
      updatePayload.tracks_obk = payload.tracks_obk;
    if (payload.obk_pulled !== undefined)
      updatePayload.obk_pulled = payload.obk_pulled;
    if (payload.tracks_joint !== undefined)
      updatePayload.tracks_joint = payload.tracks_joint;
    if (payload.joint_done !== undefined)
      updatePayload.joint_done = payload.joint_done;
    if (payload.tracks_cable !== undefined)
      updatePayload.tracks_cable = payload.tracks_cable;
    if (payload.tracks_excavation !== undefined)
      updatePayload.tracks_excavation = payload.tracks_excavation;
    if (payload.excavation_done !== undefined)
      updatePayload.excavation_done = payload.excavation_done;
    if (payload.progress_notes !== undefined)
      updatePayload.progress_notes = emptyToNull(payload.progress_notes);
    if (payload.is_archived !== undefined)
      updatePayload.is_archived = payload.is_archived;
    if (payload.archived_at !== undefined)
      updatePayload.archived_at = payload.archived_at;
    if (payload.project_date !== undefined)
      updatePayload.project_date = emptyToNull(payload.project_date);
    if (payload.priority_order !== undefined)
      updatePayload.priority_order = payload.priority_order;
    if (payload.completed_by_personnel_id !== undefined)
      updatePayload.completed_by_personnel_id = payload.completed_by_personnel_id;
    if (payload.completed_by_name !== undefined)
      updatePayload.completed_by_name = emptyToNull(payload.completed_by_name);
    if (payload.current_team_leader_personnel_id !== undefined)
      updatePayload.current_team_leader_personnel_id = payload.current_team_leader_personnel_id;
    if (payload.current_team_leader_name !== undefined)
      updatePayload.current_team_leader_name = emptyToNull(payload.current_team_leader_name);

    const { data, error } = await this.supabase
      .from("projects")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    const sheetTracking: Record<string, boolean> = {};
    if (payload.tracks_cable !== undefined) sheetTracking.tracks_cable = payload.tracks_cable;
    if (payload.tracks_joint !== undefined) sheetTracking.tracks_joint = payload.tracks_joint;
    if (payload.tracks_obk !== undefined) sheetTracking.tracks_obk = payload.project_type === "BGFD" ? false : payload.tracks_obk;
    if (payload.tracks_excavation !== undefined) sheetTracking.tracks_excavation = payload.tracks_excavation;
    if (Object.keys(sheetTracking).length) {
      const { error: sheetTrackingError } = await this.supabase.from("project_sheets").update(sheetTracking).eq("project_id", id);
      if (sheetTrackingError) throw sheetTrackingError;
    }
    if (payload.tracks_excavation !== undefined) {
      const { error: cabinetTrackingError } = await this.supabase.from("project_cabinets").update({ tracks_excavation: payload.tracks_excavation }).eq("project_id", id);
      if (cabinetTrackingError) throw cabinetTrackingError;
    }
    return data as Project;
  }

  async updateWithStageDate(
    id: string,
    payload: ProjectUpdate & { stage_date?: string | null }
  ): Promise<Project> {
    const { stage_date, ...rest } = payload;

    if (rest.status && stage_date !== undefined) {
      const key = getStageDateKey(rest.status);
      return this.update(id, {
        ...rest,
        [key]: emptyToNull(stage_date),
      });
    }

    return this.update(id, rest);
  }

  async bulkUpdateTracking(
    updates: ProjectTrackingUpdate[]
  ): Promise<Project[]> {
    if (updates.length === 0) return [];

    const { data, error } = await this.supabase.rpc(
      "bulk_update_project_tracking",
      { p_updates: updates }
    );

    if (error) throw error;
    return (data ?? []) as Project[];
  }

  async reactivate(id: string): Promise<Project> {
    const { data, error } = await this.supabase.rpc("reactivate_cancelled_project", {
      p_project_id: id,
    });
    if (error) throw error;
    return data as Project;
  }

  async cancel(id: string, reason: string): Promise<Project> {
    const { data, error } = await this.supabase.rpc("cancel_project", {
      p_project_id: id,
      p_reason: reason,
    });
    if (error) throw error;
    return data as Project;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase.from("projects").delete().eq("id", id);
    if (error) throw error;
  }

  async getLocationSuggestions(query = "", limit = 20): Promise<string[]> {
    const { data, error } = await this.supabase.rpc("get_location_suggestions", {
      p_query: query,
      p_limit: limit,
    });

    if (error) throw error;
    return ((data as { value: string }[] | null) ?? []).map((r) => r.value);
  }

  async getDistinctLocations(projectType?: string | string[]): Promise<string[]> {
    let query = this.supabase
      .from("projects")
      .select("location")
      .order("location");
    if (Array.isArray(projectType)) query = query.in("project_type", projectType);
    else if (projectType) query = query.eq("project_type", projectType);
    const { data, error } = await query;

    if (error) throw error;
    return [...new Set((data ?? []).map((r) => r.location as string))];
  }
}
