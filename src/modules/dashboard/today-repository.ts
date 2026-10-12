import type { SupabaseClient } from "@supabase/supabase-js";

/** Bugünkü iş planındaki bir ekip ve o gün girilen imalatı. */
export type TodayTeam = {
  id: string;
  branch_id: string;
  team_type: string;
  project_name: string;
  chief_name: string;
  vehicle_plate: string;
  work_location: string | null;
  member_count: number;
  /** Ekip başının bugün girdiği imalat kalemleri; girilmediyse null. */
  production: string[] | null;
};

export type TodayBranchRow = {
  branch_id: string;
  teams: number;
  people: number;
  teams_with_production: number;
  worked: number;
  away: number;
};

export type TodaySummary = {
  date: string;
  teams: TodayTeam[];
  /** İş planında olmayan ekip başlarının bugün girdiği imalatlar. */
  extraProduction: { leader: string; items: string[] }[];
  branches: TodayBranchRow[];
  attendance: { worked: number; leave: number; medical_report: number; absent: number };
};

type PlanRow = {
  branch_id: string;
  teams: {
    id: string;
    sort_order: number;
    team_type: string;
    project_name: string;
    chief_name: string;
    chief_personnel_id: string | null;
    vehicle_plate: string;
    work_location: string | null;
    members: { id: string }[];
  }[];
};

type EntryRow = {
  branch_id: string;
  team_leader_personnel_id: string;
  team_leader_name_snapshot: string;
  jobs: { project_name_snapshot: string; items: { item_name_snapshot: string; quantity: number; unit_snapshot: string }[] }[];
};

type AttendanceRow = { status: string; personnel: { branch_id: string } | null };

const istanbulToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });

/**
 * "Bugün" özeti: hangi ekip nerede, imalat girildi mi, puantaj durumu. Veri RLS ile kullanıcının
 * erişebildiği şubelerle sınırlıdır; şube verilirse yalnızca o şube.
 */
export class TodayRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async get(branchId: string | null): Promise<TodaySummary> {
    const date = istanbulToday();
    let plans = this.supabase
      .from("daily_work_plans")
      .select("branch_id, teams:daily_work_plan_teams(id, sort_order, team_type, project_name, chief_name, chief_personnel_id, vehicle_plate, work_location, members:daily_work_plan_team_members(id))")
      .eq("plan_date", date);
    let entries = this.supabase
      .from("production_entries")
      .select("branch_id, team_leader_personnel_id, team_leader_name_snapshot, jobs:production_jobs(project_name_snapshot, items:production_items(item_name_snapshot, quantity, unit_snapshot))")
      .eq("work_date", date);
    let attendance = this.supabase
      .from("attendance_records")
      .select("status, personnel:personnel!inner(branch_id)")
      .eq("attendance_date", date);
    if (branchId) {
      plans = plans.eq("branch_id", branchId);
      entries = entries.eq("branch_id", branchId);
      attendance = attendance.eq("personnel.branch_id", branchId);
    }
    const [planResult, entryResult, attendanceResult] = await Promise.all([plans, entries, attendance]);
    if (planResult.error) throw planResult.error;
    if (entryResult.error) throw entryResult.error;
    if (attendanceResult.error) throw attendanceResult.error;

    const entryRows = (entryResult.data ?? []) as unknown as EntryRow[];
    const itemsOf = (entry: EntryRow) =>
      entry.jobs.flatMap((job) =>
        job.items.map((item) => `${item.item_name_snapshot} ${Number(item.quantity).toLocaleString("tr-TR")} ${item.unit_snapshot}`)
      );
    const usedLeaders = new Set<string>();

    const teams: TodayTeam[] = ((planResult.data ?? []) as unknown as PlanRow[]).flatMap((plan) =>
      [...plan.teams]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((team) => {
          const own = team.chief_personnel_id
            ? entryRows.filter((entry) => entry.team_leader_personnel_id === team.chief_personnel_id)
            : [];
          if (team.chief_personnel_id && own.length) usedLeaders.add(team.chief_personnel_id);
          return {
            id: team.id,
            branch_id: plan.branch_id,
            team_type: team.team_type,
            project_name: team.project_name,
            chief_name: team.chief_name,
            vehicle_plate: team.vehicle_plate,
            work_location: team.work_location,
            member_count: team.members.length,
            production: own.length ? own.flatMap(itemsOf) : null,
          };
        })
    );

    const extraProduction = entryRows
      .filter((entry) => !usedLeaders.has(entry.team_leader_personnel_id))
      .map((entry) => ({ leader: entry.team_leader_name_snapshot, items: itemsOf(entry) }));

    const attendanceRows = (attendanceResult.data ?? []) as unknown as AttendanceRow[];
    const count = (status: string) => attendanceRows.filter((row) => row.status === status).length;

    const branchIds = new Set<string>([
      ...teams.map((team) => team.branch_id),
      ...attendanceRows.map((row) => row.personnel?.branch_id).filter((id): id is string => Boolean(id)),
    ]);
    const branches: TodayBranchRow[] = [...branchIds].map((id) => {
      const own = teams.filter((team) => team.branch_id === id);
      const rows = attendanceRows.filter((row) => row.personnel?.branch_id === id);
      return {
        branch_id: id,
        teams: own.length,
        people: own.reduce((sum, team) => sum + team.member_count, 0),
        teams_with_production: own.filter((team) => team.production).length,
        worked: rows.filter((row) => row.status === "worked").length,
        away: rows.filter((row) => row.status !== "worked" && row.status !== "weekly_rest").length,
      };
    });

    return {
      date,
      teams,
      extraProduction,
      branches,
      attendance: {
        worked: count("worked"),
        leave: count("leave"),
        medical_report: count("medical_report"),
        absent: count("absent") + count("unexcused_absence"),
      },
    };
  }
}
