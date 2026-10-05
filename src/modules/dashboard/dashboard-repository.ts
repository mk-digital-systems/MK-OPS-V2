import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardOverview, DashboardStats } from "@/types/project";

const EMPTY_STATS: DashboardStats = {
  total: 0,
  waiting: 0,
  in_progress: 0,
  on_hold: 0,
  delayed: 0,
  completed: 0,
  archived: 0,
  cancelled: 0,
};

export class DashboardRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getStats(): Promise<DashboardStats> {
    const { error: refreshError } = await this.supabase.rpc("refresh_overdue_project_statuses");
    if (refreshError && refreshError.code !== "PGRST202") throw refreshError;
    const { data, error } = await this.supabase.rpc("get_dashboard_stats");
    if (error) throw error;
    return { ...EMPTY_STATS, ...(data as Partial<DashboardStats> | null) };
  }

  async getOverview(): Promise<DashboardOverview> {
    const { data, error } = await this.supabase.rpc("get_dashboard_overview");
    if (error) throw error;
    const overview = (data ?? {}) as Partial<DashboardOverview>;
    return {
      types: overview.types ?? [],
      upcoming: overview.upcoming ?? [],
      recent_logs: overview.recent_logs ?? [],
    };
  }
}
