import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditActor, AuditFilters, AuditLog } from "@/types/audit";

export const AUDIT_PAGE_SIZE = 50;

/** İstanbul saatine göre gün sınırı (YYYY-MM-DD → ISO). */
function dayStart(date: string) {
  return `${date}T00:00:00+03:00`;
}

export class AuditRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  /** Bir fazlası istenir; dönen dizi sayfa boyutunu aşarsa sonraki sayfa vardır. */
  async list(filters: AuditFilters): Promise<{ logs: AuditLog[]; hasMore: boolean }> {
    const nextDay = new Date(`${filters.to}T00:00:00Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    let query = this.supabase
      .from("audit_logs")
      .select("id, created_at, actor_user_id, actor_name, actor_role, module, entity_type, entity_id, entity_label, action, changes")
      .gte("created_at", dayStart(filters.from))
      .lt("created_at", dayStart(nextDay.toISOString().slice(0, 10)))
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(filters.page * AUDIT_PAGE_SIZE, (filters.page + 1) * AUDIT_PAGE_SIZE);
    if (filters.module) query = query.eq("module", filters.module);
    if (filters.actor) query = query.eq("actor_user_id", filters.actor);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as AuditLog[];
    return { logs: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE };
  }

  /** Filtre için firmadaki kullanıcılar. */
  async listActors(): Promise<AuditActor[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name");
    if (error) throw error;
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: (row.full_name as string | null)?.trim() || (row.email as string | null) || "—",
    }));
  }
}
