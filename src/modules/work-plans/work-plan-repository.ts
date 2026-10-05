import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DailyWorkPlan,
  DailyWorkPlanWithTeams,
  WorkPlanAbsenceSnapshot,
  WorkPlanSearchHit,
  WorkPlanTeamSnapshot,
  WorkPlanDraft,
} from "@/types/work-plan";
import { todayISODate } from "@/lib/constants/project";

type TeamRow = {
  id: string;
  plan_id: string;
  sort_order: number;
  project_code: string;
  project_name: string;
  team_type: string;
  vehicle_plate: string;
  chief_personnel_id: string | null;
  chief_name: string;
  chief_phone: string;
  daily_work_plan_team_members?: MemberRow[] | null;
};

type MemberRow = {
  id: string;
  team_id: string;
  sort_order: number;
  personnel_id: string | null;
  full_name: string;
  job_title: string | null;
  phone: string | null;
  is_chief: boolean;
};

type AbsenceRow = {
  id: string;
  personnel_id: string;
  full_name: string;
  status: "leave" | "sick_report";
};

function persistenceError(stage: string, error: unknown): Error {
  const source = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };
  const detail = [source?.message, source?.details, source?.hint]
    .filter(Boolean)
    .join(" — ");
  const wrapped = new Error(`${stage}: ${detail || "Bilinmeyen Supabase hatası"}`);
  if (source?.code) {
    Object.assign(wrapped, { code: source.code });
  }
  return wrapped;
}

function mapAbsences(rows?: AbsenceRow[] | null): WorkPlanAbsenceSnapshot[] {
  return [...(rows ?? [])]
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "tr"))
    .map((row) => ({
      id: row.id,
      personnel_id: row.personnel_id,
      full_name: row.full_name,
      status: row.status,
    }));
}

function mapTeam(row: TeamRow): WorkPlanTeamSnapshot {
  const members = [...(row.daily_work_plan_team_members ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order
  );

  return {
    id: row.id,
    sort_order: row.sort_order,
    project_code: row.project_code,
    project_name: row.project_name,
    team_type: row.team_type,
    vehicle_plate: row.vehicle_plate,
    chief_personnel_id: row.chief_personnel_id,
    chief_name: row.chief_name,
    chief_phone: row.chief_phone,
    members: members.map((m) => ({
      id: m.id,
      personnel_id: m.personnel_id,
      full_name: m.full_name,
      job_title: m.job_title,
      phone: m.phone,
      is_chief: m.is_chief,
      sort_order: m.sort_order,
    })),
  };
}

export class WorkPlanRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listPlans(limit = 60): Promise<DailyWorkPlan[]> {
    const { data, error } = await this.supabase
      .from("daily_work_plans")
      .select("*")
      .order("plan_date", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as DailyWorkPlan[];
  }

  async listDrafts(): Promise<WorkPlanDraft[]> {
    const { data, error } = await this.supabase
      .from("daily_work_plan_drafts")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as WorkPlanDraft[];
  }

  async getDraft(id: string): Promise<WorkPlanDraft | null> {
    const { data, error } = await this.supabase
      .from("daily_work_plan_drafts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data as WorkPlanDraft | null;
  }

  async saveDraft(input: {
    id?: string;
    planDate: string;
    notes?: string | null;
    userId: string;
    teams: WorkPlanTeamSnapshot[];
    absences: WorkPlanAbsenceSnapshot[];
  }): Promise<WorkPlanDraft> {
    const payload = {
      plan_date: input.planDate,
      notes: input.notes?.trim() || null,
      teams: input.teams,
      absences: input.absences,
      created_by: input.userId,
    };
    const query = input.id
      ? this.supabase.from("daily_work_plan_drafts").update(payload).eq("id", input.id)
      : this.supabase.from("daily_work_plan_drafts").insert(payload);
    const { data, error } = await query.select("*").single();
    if (error) throw persistenceError("Taslak kaydedilemedi", error);
    return data as WorkPlanDraft;
  }

  async deleteDraft(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("daily_work_plan_drafts")
      .delete()
      .eq("id", id);
    if (error) throw persistenceError("Taslak silinemedi", error);
  }

  async getByDate(planDate: string): Promise<DailyWorkPlanWithTeams | null> {
    const { data, error } = await this.supabase
      .from("daily_work_plans")
      .select(
        `
        *,
        daily_work_plan_teams (
          *,
          daily_work_plan_team_members (*)
        ),
        daily_work_plan_absences (*)
      `
      )
      .eq("plan_date", planDate)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const teams = [...((data.daily_work_plan_teams as TeamRow[]) ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapTeam);

    return {
      id: data.id as string,
      plan_date: data.plan_date as string,
      notes: (data.notes as string | null) ?? null,
      created_by: (data.created_by as string | null) ?? null,
      updated_by: (data.updated_by as string | null) ?? null,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
      teams,
      absences: mapAbsences(data.daily_work_plan_absences as AbsenceRow[]),
    };
  }

  async getById(id: string): Promise<DailyWorkPlanWithTeams | null> {
    const { data, error } = await this.supabase
      .from("daily_work_plans")
      .select(
        `
        *,
        daily_work_plan_teams (
          *,
          daily_work_plan_team_members (*)
        ),
        daily_work_plan_absences (*)
      `
      )
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const teams = [...((data.daily_work_plan_teams as TeamRow[]) ?? [])]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(mapTeam);

    return {
      id: data.id as string,
      plan_date: data.plan_date as string,
      notes: (data.notes as string | null) ?? null,
      created_by: (data.created_by as string | null) ?? null,
      updated_by: (data.updated_by as string | null) ?? null,
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
      teams,
      absences: mapAbsences(data.daily_work_plan_absences as AbsenceRow[]),
    };
  }

  async deletePlan(id: string): Promise<void> {
    const plan = await this.getById(id);
    if (plan && plan.plan_date < todayISODate()) {
      throw new Error("Geçmiş iş planları tek tek silinemez");
    }
    const { error } = await this.supabase
      .from("daily_work_plans")
      .delete()
      .eq("id", id);

    if (error) throw error;
  }

  async deletePlansByMonth(month: string): Promise<void> {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new Error("Geçerli bir ay seçin");
    }
    const currentMonth = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
    }).format(new Date());
    if (month >= currentMonth) {
      throw new Error("Yalnızca tamamlanmış geçmiş aylar silinebilir");
    }
    const [year, monthNumber] = month.split("-").map(Number);
    const nextMonth = monthNumber === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(monthNumber + 1).padStart(2, "0")}-01`;
    const { error } = await this.supabase
      .from("daily_work_plans")
      .delete()
      .gte("plan_date", `${month}-01`)
      .lt("plan_date", nextMonth);
    if (error) throw persistenceError("Aylık iş planları silinemedi", error);
  }

  async getLatestBefore(planDate: string): Promise<DailyWorkPlanWithTeams | null> {
    const { data, error } = await this.supabase
      .from("daily_work_plans")
      .select("id")
      .lt("plan_date", planDate)
      .order("plan_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data?.id ? this.getById(data.id as string) : null;
  }

  async deleteTeam(teamId: string): Promise<void> {
    const { error } = await this.supabase
      .from("daily_work_plan_teams")
      .delete()
      .eq("id", teamId);

    if (error) throw error;
  }

  async upsertFullPlan(input: {
    planDate: string;
    notes?: string | null;
    userId: string;
    teams: WorkPlanTeamSnapshot[];
    absences: WorkPlanAbsenceSnapshot[];
    existingPlanId?: string;
  }): Promise<DailyWorkPlanWithTeams> {
    if (input.teams.length === 0) {
      throw new Error("En az bir ekip gerekli");
    }

    for (const team of input.teams) {
      if (!team.chief_name?.trim() || !team.chief_phone?.trim()) {
        throw new Error("Her ekipte ekip şefi ve telefon zorunlu");
      }
      const chiefs = team.members.filter((m) => m.is_chief);
      if (chiefs.length !== 1 || team.members[0]?.is_chief !== true) {
        throw new Error("Ekip şefi ilk sırada olmalıdır");
      }
    }

    const assignedPersonnel = new Set<string>();
    const assignedVehicles = new Set<string>();
    for (const team of input.teams) {
      for (const member of team.members) {
        if (!member.personnel_id) continue;
        if (assignedPersonnel.has(member.personnel_id)) {
          throw new Error(
            `${member.full_name} bu tarihte başka bir ekipte görevli.`
          );
        }
        assignedPersonnel.add(member.personnel_id);
      }

      const normalizedPlate = team.vehicle_plate
        .trim()
        .toLocaleUpperCase("tr-TR");
      if (assignedVehicles.has(normalizedPlate)) {
        throw new Error(
          `${team.vehicle_plate.trim()} plakalı araç bu tarihte başka bir ekipte kullanılıyor.`
        );
      }
      assignedVehicles.add(normalizedPlate);
    }

    const absencePersonnelIds = input.absences.map((item) => item.personnel_id);
    if (new Set(absencePersonnelIds).size !== absencePersonnelIds.length) {
      throw new Error("Aynı personel izinli/raporlu listesine iki kez eklenemez");
    }
    const teamPersonnelIds = new Set(
      input.teams.flatMap((team) =>
        team.members.flatMap((member) =>
          member.personnel_id ? [member.personnel_id] : []
        )
      )
    );
    if (absencePersonnelIds.some((id) => teamPersonnelIds.has(id))) {
      throw new Error("Personel aynı planda hem ekipte hem izinli/raporlu olamaz");
    }

    let planId = input.existingPlanId;
    const planOnSelectedDate = await this.getByDate(input.planDate);

    if (planOnSelectedDate && planOnSelectedDate.id !== input.existingPlanId) {
      for (const team of planOnSelectedDate.teams) {
        const conflictingMember = team.members.find(
          (member) =>
            member.personnel_id && assignedPersonnel.has(member.personnel_id)
        );
        if (conflictingMember) {
          throw new Error(
            `${conflictingMember.full_name} bu tarihte başka bir ekipte görevli.`
          );
        }

        const normalizedPlate = team.vehicle_plate
          .trim()
          .toLocaleUpperCase("tr-TR");
        if (assignedVehicles.has(normalizedPlate)) {
          throw new Error(
            `${team.vehicle_plate} plakalı araç bu tarihte başka bir ekipte kullanılıyor.`
          );
        }
      }
    }

    if (!planId) {
      planId = planOnSelectedDate?.id;
    }

    if (planId) {
      const { error: updateError } = await this.supabase
        .from("daily_work_plans")
        .update({
          notes: input.notes?.trim() || null,
          updated_by: input.userId,
        })
        .eq("id", planId);

      if (updateError) throw persistenceError("Plan güncellenemedi", updateError);

      const { error: deleteTeamsError } = await this.supabase
        .from("daily_work_plan_teams")
        .delete()
        .eq("plan_id", planId);

      if (deleteTeamsError) {
        throw persistenceError("Eski ekipler temizlenemedi", deleteTeamsError);
      }

      const { error: deleteAbsencesError } = await this.supabase
        .from("daily_work_plan_absences")
        .delete()
        .eq("work_plan_id", planId);

      if (deleteAbsencesError) {
        throw persistenceError(
          "Eski izinli/raporlu kayıtları temizlenemedi",
          deleteAbsencesError
        );
      }
    } else {
      const { data: created, error: createError } = await this.supabase
        .from("daily_work_plans")
        .insert({
          plan_date: input.planDate,
          notes: input.notes?.trim() || null,
          created_by: input.userId,
          updated_by: input.userId,
        })
        .select("*")
        .single();

      if (createError) throw persistenceError("Plan oluşturulamadı", createError);
      planId = created.id;
    }

    for (let i = 0; i < input.teams.length; i++) {
      const team = input.teams[i];
      const { data: teamRow, error: teamError } = await this.supabase
        .from("daily_work_plan_teams")
        .insert({
          plan_id: planId,
          sort_order: i,
          project_code: team.project_code.trim() || "-",
          project_name: team.project_name.trim(),
          team_type: team.team_type.trim(),
          vehicle_plate: team.vehicle_plate.trim(),
          chief_personnel_id: team.chief_personnel_id,
          chief_name: team.chief_name.trim(),
          chief_phone: team.chief_phone.trim(),
        })
        .select("*")
        .single();

      if (teamError) {
        throw persistenceError(`Ekip ${i + 1} kaydedilemedi`, teamError);
      }

      const memberRows = team.members.map((m, idx) => ({
        team_id: teamRow.id,
        sort_order: idx,
        personnel_id: m.personnel_id,
        full_name: m.full_name.trim(),
        job_title: m.job_title?.trim() || null,
        phone: m.is_chief ? m.phone?.trim() || team.chief_phone.trim() : null,
        is_chief: m.is_chief,
      }));

      const { error: membersError } = await this.supabase
        .from("daily_work_plan_team_members")
        .insert(memberRows);

      if (membersError) {
        throw persistenceError(
          `Ekip ${i + 1} personelleri kaydedilemedi`,
          membersError
        );
      }
    }

    if (input.absences.length > 0) {
      const { error: absencesError } = await this.supabase
        .from("daily_work_plan_absences")
        .insert(
          input.absences.map((absence) => ({
            work_plan_id: planId,
            personnel_id: absence.personnel_id,
            full_name: absence.full_name.trim(),
            status: absence.status,
          }))
        );
      if (absencesError) {
        throw persistenceError(
          "İzinli/raporlu personeller kaydedilemedi",
          absencesError
        );
      }
    }

    let full: DailyWorkPlanWithTeams | null;
    try {
      full = await this.getById(planId!);
    } catch (error) {
      throw persistenceError("Kaydedilen plan tekrar okunamadı", error);
    }
    if (!full) throw new Error("Plan kaydedilemedi");
    return full;
  }

  async search(term: string): Promise<WorkPlanSearchHit[]> {
    const q = term.trim();
    if (!q) return [];

    const like = `%${q.replace(/[%_]/g, "\\$&")}%`;

    const { data: teams, error } = await this.supabase
      .from("daily_work_plan_teams")
      .select(
        `
        id,
        project_code,
        project_name,
        team_type,
        vehicle_plate,
        chief_name,
        plan_id,
        daily_work_plans!inner ( id, plan_date ),
        daily_work_plan_team_members ( full_name, is_chief, sort_order )
      `
      )
      .or(
        `project_code.ilike.${like},project_name.ilike.${like},team_type.ilike.${like},vehicle_plate.ilike.${like},chief_name.ilike.${like}`
      )
      .limit(100);

    if (error) throw error;

    const { data: memberHits, error: memberError } = await this.supabase
      .from("daily_work_plan_team_members")
      .select(
        `
        full_name,
        team_id,
        daily_work_plan_teams!inner (
          id,
          project_code,
          project_name,
          team_type,
          vehicle_plate,
          chief_name,
          plan_id,
          daily_work_plans!inner ( id, plan_date ),
          daily_work_plan_team_members ( full_name, is_chief, sort_order )
        )
      `
      )
      .ilike("full_name", like)
      .limit(100);

    if (memberError) throw memberError;

    const map = new Map<string, WorkPlanSearchHit>();

    const pushTeam = (team: {
      id: string;
      project_code: string;
      project_name: string;
      team_type: string;
      vehicle_plate: string;
      chief_name: string;
      plan_id: string;
      daily_work_plans: { id: string; plan_date: string } | { id: string; plan_date: string }[];
      daily_work_plan_team_members?: { full_name: string; is_chief: boolean; sort_order: number }[];
    }) => {
      const plan = Array.isArray(team.daily_work_plans)
        ? team.daily_work_plans[0]
        : team.daily_work_plans;
      if (!plan) return;

      const members = [...(team.daily_work_plan_team_members ?? [])]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((m) => m.full_name);

      map.set(team.id, {
        plan_id: plan.id,
        plan_date: plan.plan_date,
        team_id: team.id,
        project_code: team.project_code,
        project_name: team.project_name,
        team_type: team.team_type,
        vehicle_plate: team.vehicle_plate,
        chief_name: team.chief_name,
        member_names: members,
      });
    };

    for (const row of teams ?? []) {
      pushTeam(row as never);
    }

    for (const row of memberHits ?? []) {
      const team = row.daily_work_plan_teams as never;
      if (team) pushTeam(Array.isArray(team) ? team[0] : team);
    }

    // Tarih araması (gg.aa.yyyy veya yyyy-mm-dd)
    const dateCandidates = [q];
    const trMatch = q.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (trMatch) {
      dateCandidates.push(`${trMatch[3]}-${trMatch[2]}-${trMatch[1]}`);
    }

    for (const dateQ of dateCandidates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateQ)) continue;
      const byDate = await this.getByDate(dateQ);
      if (!byDate) continue;
      for (const team of byDate.teams) {
        map.set(team.id!, {
          plan_id: byDate.id,
          plan_date: byDate.plan_date,
          team_id: team.id!,
          project_code: team.project_code,
          project_name: team.project_name,
          team_type: team.team_type,
          vehicle_plate: team.vehicle_plate,
          chief_name: team.chief_name,
          member_names: team.members.map((m) => m.full_name),
        });
      }
    }

    return [...map.values()].sort((a, b) =>
      a.plan_date < b.plan_date ? 1 : -1
    );
  }

  async getTeamTypeSuggestions(query = ""): Promise<string[]> {
    const { data, error } = await this.supabase.rpc(
      "get_team_type_suggestions",
      { p_query: query, p_limit: 20 }
    );
    if (error) throw error;
    return ((data as { value: string }[]) ?? []).map((r) => r.value);
  }

  async getVehiclePlateSuggestions(query = ""): Promise<string[]> {
    const { data, error } = await this.supabase.rpc(
      "get_vehicle_plate_suggestions",
      { p_query: query, p_limit: 20 }
    );
    if (error) throw error;
    return ((data as { value: string }[]) ?? []).map((r) => r.value);
  }
}
