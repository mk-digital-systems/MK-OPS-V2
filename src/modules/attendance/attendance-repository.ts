import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AttendanceChange,
  AttendanceMonthArchive,
  AttendanceStatus,
  MonthlyAttendanceData,
  PersonnelAttendanceDetail,
  PersonnelAttendanceSummary,
  PersonnelActivityFilter,
  PersonnelListSummary,
} from "@/types/attendance";

export class AttendanceRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async ensureSundays(year: number, month: number): Promise<void> {
    const { error } = await this.supabase.rpc(
      "ensure_sunday_attendance_for_month",
      { p_year: year, p_month: month }
    );
    if (error) throw error;
  }

  async getMonth(options: {
    year: number;
    month: number;
    activeFilter?: PersonnelActivityFilter;
    search?: string;
    statusFilter?: AttendanceStatus | "all";
  }): Promise<MonthlyAttendanceData> {
    const { data, error } = await this.supabase.rpc("get_monthly_attendance", {
      p_year: options.year,
      p_month: options.month,
      p_active_filter: options.activeFilter ?? "active",
      p_search: options.search?.trim() ?? "",
      p_status_filter: options.statusFilter ?? "all",
    });

    if (error) throw error;
    const result = data as MonthlyAttendanceData;
    const personnelIds = result.personnel.map((personnel) => personnel.id);
    if (personnelIds.length === 0) return result;

    const { data: periods, error: periodsError } = await this.supabase
      .from("personnel_employment_periods")
      .select("personnel_id, employment_start_date, employment_end_date")
      .in("personnel_id", personnelIds);
    if (periodsError) throw periodsError;

    result.personnel = result.personnel.map((personnel) => {
      const employmentPeriods = (periods ?? [])
        .filter((period) => period.personnel_id === personnel.id)
        .map((period) => ({
          employment_start_date: period.employment_start_date,
          employment_end_date: period.employment_end_date,
        }));
      const records = new Map(
        personnel.records.map((record) => [record.date, record])
      );
      const monthStart = `${result.year}-${String(result.month).padStart(2, "0")}-01`;
      const monthEndDay = new Date(result.year, result.month, 0).getDate();

      for (let day = 1; day <= monthEndDay; day += 1) {
        const date = `${result.year}-${String(result.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const hasPriorExit = [
          ...employmentPeriods.map((period) => period.employment_end_date),
          ...(personnel.employment_end_date
            ? [personnel.employment_end_date]
            : []),
        ].some((endDate) => endDate < date);
        const isWorkingDate =
          ((!personnel.employment_start_date ||
            date >= personnel.employment_start_date) &&
            (!personnel.employment_end_date ||
              date <= personnel.employment_end_date)) ||
          employmentPeriods.some(
            (period) =>
              (!period.employment_start_date ||
                date >= period.employment_start_date) &&
              date <= period.employment_end_date
          );

        if (date >= monthStart && hasPriorExit && !isWorkingDate) {
          records.set(date, {
            date,
            status: "absent",
            is_auto_generated: true,
          });
        }
      }

      const normalizedRecords = Array.from(records.values()).sort((a, b) =>
        a.date.localeCompare(b.date)
      );
      return {
        ...personnel,
        employment_periods: employmentPeriods,
        records: normalizedRecords,
        totals: normalizedRecords.reduce(
          (totals, record) => ({
            ...totals,
            [record.status]: totals[record.status] + 1,
          }),
          {
            worked: 0,
            absent: 0,
            unexcused_absence: 0,
            leave: 0,
            medical_report: 0,
            weekly_rest: 0,
          }
        ),
      };
    });
    return result;
  }

  async saveChanges(
    changes: AttendanceChange[]
  ): Promise<{ saved: number; deleted: number }> {
    if (changes.length === 0) return { saved: 0, deleted: 0 };

    const { data, error } = await this.supabase.rpc(
      "save_attendance_changes",
      { p_changes: changes }
    );

    if (error) throw error;
    return data as { saved: number; deleted: number };
  }

  async getMonthNotes(year: number, month: number): Promise<string> {
    const { data, error } = await this.supabase
      .from("attendance_month_notes")
      .select("notes")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();
    if (error) throw error;
    return (data?.notes as string | undefined) ?? "";
  }

  async saveMonthNotes(year: number, month: number, notes: string): Promise<void> {
    const { error } = await this.supabase
      .from("attendance_month_notes")
      .upsert({ year, month, notes: notes.trim() }, { onConflict: "year,month" });
    if (error) throw error;
  }

  async getPersonnelSummary(
    personnelId: string,
    year: number,
    month: number
  ): Promise<PersonnelAttendanceSummary | null> {
    const { data, error } = await this.supabase.rpc(
      "get_personnel_attendance_summary",
      {
        p_personnel_id: personnelId,
        p_year: year,
        p_month: month,
      }
    );

    if (error) throw error;
    return (data as PersonnelAttendanceSummary | null) ?? null;
  }

  async getMonthArchives(): Promise<AttendanceMonthArchive[]> {
    const { data, error } = await this.supabase.rpc(
      "get_attendance_month_archives"
    );
    if (error) throw error;
    return (data ?? []) as AttendanceMonthArchive[];
  }

  async getPersonnelListSummaries(
    year: number,
    month: number
  ): Promise<PersonnelListSummary[]> {
    const { data, error } = await this.supabase.rpc(
      "get_personnel_list_summaries",
      { p_year: year, p_month: month }
    );
    if (error) throw error;
    return (data ?? []) as PersonnelListSummary[];
  }

  async getPersonnelDetail(
    personnelId: string,
    year: number,
    month: number
  ): Promise<PersonnelAttendanceDetail | null> {
    const { data, error } = await this.supabase.rpc(
      "get_personnel_attendance_detail",
      {
        p_personnel_id: personnelId,
        p_year: year,
        p_month: month,
      }
    );
    if (error) throw error;
    return (data as PersonnelAttendanceDetail | null) ?? null;
  }
}
