import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductionDefinition, ProductionEntry, ProductionSaveJob } from "@/types/production";

export class ProductionRepository {
  constructor(private readonly supabase: SupabaseClient) {}
  async listDefinitions(): Promise<ProductionDefinition[]> {
    const { data, error } = await this.supabase.from("production_item_definitions").select("*").order("name");
    if (error) throw error; return (data ?? []) as ProductionDefinition[];
  }
  async saveDefinition(input: { id?: string; name: string; unit: string; is_active: boolean }): Promise<ProductionDefinition> {
    const query = input.id
      ? this.supabase.from("production_item_definitions").update({ name: input.name.trim(), unit: input.unit.trim().toLocaleUpperCase("tr-TR"), is_active: input.is_active }).eq("id", input.id)
      : this.supabase.from("production_item_definitions").insert({ name: input.name.trim(), unit: input.unit.trim().toLocaleUpperCase("tr-TR"), is_active: input.is_active });
    const { data, error } = await query.select("*").single(); if (error) throw error; return data as ProductionDefinition;
  }
  async listEntries(from: string, to: string): Promise<ProductionEntry[]> {
    const { data, error } = await this.supabase.from("production_entries").select(`*, production_jobs(*, production_items(*))`).gte("work_date", from).lte("work_date", to).order("work_date", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((entry) => ({ ...entry, jobs: [...(entry.production_jobs ?? [])].sort((a,b) => a.sort_order-b.sort_order).map((job) => ({ ...job, items: [...(job.production_items ?? [])].sort((a,b) => a.sort_order-b.sort_order) })) })) as ProductionEntry[];
  }
  async saveEntry(input: { entry_id?: string | null; work_date: string; leader_id: string; leader_name: string; work_plan_id: string | null; jobs: ProductionSaveJob[] }): Promise<string> {
    const { data, error } = await this.supabase.rpc("save_production_entry", { p_entry_id: input.entry_id ?? null, p_work_date: input.work_date, p_team_leader_personnel_id: input.leader_id, p_team_leader_name: input.leader_name, p_source_work_plan_id: input.work_plan_id, p_jobs: input.jobs });
    if (error) throw error; return data as string;
  }
  async deleteEntry(id: string) { const { error } = await this.supabase.rpc("delete_production_entry", { p_entry_id: id }); if (error) throw error; }
}
