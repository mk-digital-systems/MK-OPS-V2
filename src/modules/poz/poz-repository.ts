import type { SupabaseClient } from "@supabase/supabase-js";
import type { PozImportRow, PozList } from "@/types/poz";

/**
 * Firma poz listesi. companyId: süper admin için seçilen firma; firma kullanıcısı için null (kendi firması).
 */
export class PozRepository {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly companyId: string | null = null
  ) {}

  async getList(): Promise<PozList> {
    const { data, error } = await this.supabase.rpc("get_poz_list", { p_company_id: this.companyId });
    if (error) throw error;
    return data as PozList;
  }

  async saveItem(payload: {
    id: string | null;
    catalogId: string;
    groupName: string;
    pozCode: string;
    name: string;
    unit: string;
    isActive?: boolean | null;
  }): Promise<string> {
    const { data, error } = await this.supabase.rpc("save_poz_item", {
      p_company_id: this.companyId,
      p_id: payload.id,
      p_catalog_id: payload.catalogId,
      p_group_name: payload.groupName,
      p_poz_code: payload.pozCode,
      p_name: payload.name,
      p_unit: payload.unit,
      p_is_active: payload.isActive ?? null,
    });
    if (error) throw error;
    return data as string;
  }

  async importItems(catalogId: string, rows: PozImportRow[], validFrom: string): Promise<{ count: number; priced: number }> {
    const { data, error } = await this.supabase.rpc("import_poz_items", {
      p_company_id: this.companyId,
      p_catalog_id: catalogId,
      p_items: rows,
      p_valid_from: validFrom,
    });
    if (error) throw error;
    return data as { count: number; priced: number };
  }

  async deleteItem(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("delete_poz_item", { p_company_id: this.companyId, p_id: id });
    if (error) throw error;
  }

  /** unitPrice null: o tarihteki fiyat kaydı silinir. */
  async setPrice(stageId: string, unitPrice: number | null, validFrom: string): Promise<void> {
    const { error } = await this.supabase.rpc("set_poz_price", {
      p_company_id: this.companyId,
      p_stage_id: stageId,
      p_unit_price: unitPrice,
      p_valid_from: validFrom,
    });
    if (error) throw error;
  }

  async bulkAdjust(payload: { catalogId: string | null; groupName: string | null; percent: number; validFrom: string }): Promise<number> {
    const { data, error } = await this.supabase.rpc("bulk_adjust_poz_prices", {
      p_company_id: this.companyId,
      p_catalog_id: payload.catalogId,
      p_group_name: payload.groupName,
      p_percent: payload.percent,
      p_valid_from: payload.validFrom,
    });
    if (error) throw error;
    return data as number;
  }
}

/** Bir tarihte geçerli fiyat: o güne kadarki son kayıt. */
export function priceAt(prices: { valid_from: string; unit_price: number }[], date: string): { valid_from: string; unit_price: number } | null {
  let found: { valid_from: string; unit_price: number } | null = null;
  for (const price of prices) {
    if (price.valid_from <= date && (!found || price.valid_from > found.valid_from)) found = price;
  }
  return found;
}
