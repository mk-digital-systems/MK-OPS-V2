import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrencyCode } from "@/types/auth";
import type { HakedisReport, HakedisSummary, PendingExtraEntry } from "@/types/hakedis";

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
