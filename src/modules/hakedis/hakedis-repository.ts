import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrencyCode } from "@/types/auth";
import type { HakedisReport, HakedisSummary, PendingExtraEntry, ProjectPricing } from "@/types/hakedis";

export class HakedisRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getReport(start: string, end: string, branchId?: string | null): Promise<HakedisReport> {
    const { data, error } = await this.supabase.rpc("get_hakedis_report", { p_start: start, p_end: end, p_branch_id: branchId ?? null });
    if (error) throw error;
    return data as HakedisReport;
  }

  async getSummary(branchId?: string | null): Promise<HakedisSummary | null> {
    const { data, error } = await this.supabase.rpc("get_hakedis_summary", { p_branch_id: branchId ?? null });
    if (error) throw error;
    return (data as HakedisSummary | null) ?? null;
  }

  /** Aşama id → varsayılan birim fiyat. */
  async getStagePrices(stageIds: string[]): Promise<Record<string, number>> {
    if (!stageIds.length) return {};
    const { data, error } = await this.supabase.from("hakedis_stage_prices").select("stage_id, unit_price").in("stage_id", stageIds);
    if (error) throw error;
    return Object.fromEntries((data ?? []).map((row) => [row.stage_id as string, Number(row.unit_price)]));
  }

  async getProjectPricing(stageIds: string[], progressIds: string[], logIds: string[]): Promise<ProjectPricing> {
    const [stagePrices, projectPrices, logValues] = await Promise.all([
      this.getStagePrices(stageIds),
      progressIds.length
        ? this.supabase.from("hakedis_project_prices").select("progress_id, unit_price").in("progress_id", progressIds)
        : Promise.resolve({ data: [], error: null }),
      logIds.length
        ? this.supabase.from("hakedis_log_values").select("log_id, unit_price, amount").in("log_id", logIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (projectPrices.error) throw projectPrices.error;
    if (logValues.error) throw logValues.error;
    return {
      stagePrices,
      projectPrices: Object.fromEntries(
        ((projectPrices.data ?? []) as { progress_id: string; unit_price: number }[]).map((row) => [row.progress_id, Number(row.unit_price)])
      ),
      logValues: Object.fromEntries(
        ((logValues.data ?? []) as { log_id: string; unit_price: number; amount: number }[]).map((row) => [
          row.log_id,
          { unit_price: Number(row.unit_price), amount: Number(row.amount) },
        ])
      ),
    };
  }

  async saveStagePrices(prices: { stage_id: string; unit_price: number | null }[]): Promise<void> {
    if (!prices.length) return;
    const { error } = await this.supabase.rpc("save_stage_prices", { p_prices: prices });
    if (error) throw error;
  }

  async setProjectStagePrice(progressId: string, unitPrice: number | null): Promise<void> {
    const { error } = await this.supabase.rpc("set_project_stage_price", { p_progress_id: progressId, p_unit_price: unitPrice });
    if (error) throw error;
  }

  /** İmalattaki ek işin (kind = extra) birim fiyatı; null fiyatı kaldırır. */
  /** Fiyat onayı bekleyen imalatlar (yalnızca hakediş yetkisi olanlar). */
  async listPendingExtras(): Promise<PendingExtraEntry[]> {
    const { data, error } = await this.supabase.rpc("list_pending_production_extras");
    if (error) throw error;
    return (data ?? []) as PendingExtraEntry[];
  }

  /** İmalattaki fiyatı girilmemiş bütün ek işler fiyatlarıyla birlikte onaylanır. */
  async approveExtras(entryId: string, prices: { item_id: string; unit_price: number }[]): Promise<void> {
    const { error } = await this.supabase.rpc("approve_production_extras", { p_entry_id: entryId, p_prices: prices });
    if (error) throw error;
  }

  async setExtraPrice(itemId: string, unitPrice: number | null): Promise<void> {
    const { error } = await this.supabase.rpc("set_production_extra_price", { p_item_id: itemId, p_unit_price: unitPrice });
    if (error) throw error;
  }

  async updateCompanySettings(payrollStartDay: number, currency: CurrencyCode): Promise<void> {
    const { error } = await this.supabase.rpc("update_company_settings", {
      p_payroll_start_day: payrollStartDay,
      p_currency_code: currency,
    });
    if (error) throw error;
  }
}
