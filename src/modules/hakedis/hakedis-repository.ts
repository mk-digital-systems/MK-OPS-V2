import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrencyCode } from "@/types/auth";
import type { HakedisReport, HakedisSummary, ProjectPricing } from "@/types/hakedis";

export class HakedisRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getReport(start: string, end: string): Promise<HakedisReport> {
    const { data, error } = await this.supabase.rpc("get_hakedis_report", { p_start: start, p_end: end });
    if (error) throw error;
    return data as HakedisReport;
  }

  async getSummary(): Promise<HakedisSummary | null> {
    const { data, error } = await this.supabase.rpc("get_hakedis_summary");
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

  async updateCompanySettings(payrollStartDay: number, currency: CurrencyCode): Promise<void> {
    const { error } = await this.supabase.rpc("update_company_settings", {
      p_payroll_start_day: payrollStartDay,
      p_currency_code: currency,
    });
    if (error) throw error;
  }
}
