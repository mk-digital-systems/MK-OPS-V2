import type { SupabaseClient } from "@supabase/supabase-js";
import type { DashboardOverview, DashboardStats, Project } from "@/types/project";

const EMPTY_STATS: DashboardStats = {
  total: 0,
  waiting: 0,
  in_progress: 0,
  excavation_permit_waiting: 0,
  delayed: 0,
  completed: 0,
  archived: 0,
};

export class DashboardRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getOverview(): Promise<DashboardOverview> {
    const { data, error } = await this.supabase.rpc("get_dashboard_overview");
    if (error) {
      const [stats, recentlyUpdated, recentlyCreated] = await Promise.all([
        this.getStats(),
        this.getRecentlyUpdated(8),
        this.getRecentlyCreated(8),
      ]);
      const emptyCategory = (category: string) => ({
        category,
        total: 0,
        not_started: 0,
        in_progress: 0,
        obk_waiting: 0,
        excavation_waiting: 0,
        cable_waiting: 0,
        completed: 0,
        delayed: 0,
      });

      return {
        stats,
        categories: ["HP_ODAKLI", "KURUMSAL_TTVPN", "BGFD"].map(emptyCategory),
        critical: {
          delayed: stats.delayed,
          excavation_waiting: stats.excavation_permit_waiting,
          obk_waiting: 0,
          cable_waiting: 0,
        },
        recently_updated: recentlyUpdated,
        recently_created: recentlyCreated,
      };
    }

    const overview = data as DashboardOverview;
    return {
      stats: { ...EMPTY_STATS, ...overview?.stats },
      categories: overview?.categories ?? [],
      critical: overview?.critical ?? {
        delayed: 0,
        excavation_waiting: 0,
        obk_waiting: 0,
        cable_waiting: 0,
      },
      recently_updated: overview?.recently_updated ?? [],
      recently_created: overview?.recently_created ?? [],
    };
  }

  async getStats(): Promise<DashboardStats> {
    const { data, error } = await this.supabase.rpc("get_dashboard_stats");
    if (error) throw error;
    return { ...EMPTY_STATS, ...(data as DashboardStats) };
  }

  async getRecentlyUpdated(limit = 8): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("*")
      .eq("is_archived", false)
      .eq("is_cancelled", false)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as Project[];
  }

  async getRecentlyCreated(limit = 8): Promise<Project[]> {
    const { data, error } = await this.supabase
      .from("projects")
      .select("*")
      .eq("is_archived", false)
      .eq("is_cancelled", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    return (data ?? []) as Project[];
  }
}
