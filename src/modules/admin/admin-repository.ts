import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminCompany, AdminCompanyUser, AdminSupportRequest, Catalog, CatalogItem, CatalogType, SupportStatus } from "@/types/admin";

export class AdminRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listCompanies(): Promise<AdminCompany[]> {
    const { data, error } = await this.supabase.rpc("admin_list_companies");
    if (error) throw error;
    return (data ?? []) as AdminCompany[];
  }

  async listCompanyUsers(companyId: string): Promise<AdminCompanyUser[]> {
    const { data, error } = await this.supabase.rpc("admin_company_users", {
      p_company_id: companyId,
    });
    if (error) throw error;
    return (data ?? []) as AdminCompanyUser[];
  }

  async updateCompany(payload: {
    companyId: string;
    plan: string | null;
    planEndsAt: string | null;
    userLimit: number | null;
    trialEndsAt: string;
  }): Promise<void> {
    const { error } = await this.supabase.rpc("admin_update_company", {
      p_company_id: payload.companyId,
      p_plan: payload.plan,
      p_plan_ends_at: payload.planEndsAt,
      p_user_limit: payload.userLimit,
      p_trial_ends_at: payload.trialEndsAt,
    });
    if (error) throw error;
  }

  // ---------------------------------------------------------------- kataloglar
  async listCatalogs(): Promise<Catalog[]> {
    const { data, error } = await this.supabase.rpc("admin_list_catalogs");
    if (error) throw error;
    return (data ?? []) as Catalog[];
  }

  async saveCatalog(payload: { id: string | null; name: string; description: string }): Promise<string> {
    const { data, error } = await this.supabase.rpc("admin_save_catalog", {
      p_id: payload.id,
      p_name: payload.name,
      p_description: payload.description,
    });
    if (error) throw error;
    return data as string;
  }

  async deleteCatalog(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("admin_delete_catalog", { p_id: id });
    if (error) throw error;
  }

  async saveCatalogType(payload: {
    id: string | null;
    catalogId: string;
    name: string;
    screen: CatalogType["screen"];
    color: string;
    description: string;
  }): Promise<string> {
    const { data, error } = await this.supabase.rpc("admin_save_catalog_type", {
      p_id: payload.id,
      p_catalog_id: payload.catalogId,
      p_name: payload.name,
      p_screen: payload.screen,
      p_color: payload.color,
      p_description: payload.description,
    });
    if (error) throw error;
    return data as string;
  }

  async deleteCatalogType(id: string): Promise<void> {
    const { error } = await this.supabase.rpc("admin_delete_catalog_type", { p_id: id });
    if (error) throw error;
  }

  async saveCatalogItems(catalogId: string, items: CatalogItem[]): Promise<void> {
    const { error } = await this.supabase.rpc("admin_save_catalog_items", {
      p_catalog_id: catalogId,
      p_items: items.map((item) => ({ group_name: item.group_name, poz_code: item.poz_code, name: item.name, unit: item.unit })),
    });
    if (error) throw error;
  }

  async setCompanyCatalogs(companyId: string, catalogIds: string[]): Promise<void> {
    const { error } = await this.supabase.rpc("admin_set_company_catalogs", { p_company_id: companyId, p_catalog_ids: catalogIds });
    if (error) throw error;
  }

  async setSuspended(companyId: string, suspended: boolean): Promise<void> {
    const { error } = await this.supabase.rpc("admin_set_company_suspended", {
      p_company_id: companyId,
      p_suspended: suspended,
    });
    if (error) throw error;
  }

  async deleteCompany(companyId: string, confirmName: string): Promise<void> {
    const { error } = await this.supabase.rpc("admin_delete_company", {
      p_company_id: companyId,
      p_confirm_name: confirmName,
    });
    if (error) throw error;
  }

  async listSupportRequests(): Promise<AdminSupportRequest[]> {
    const { data, error } = await this.supabase.rpc("admin_list_support_requests");
    if (error) throw error;
    return (data ?? []) as AdminSupportRequest[];
  }

  async replySupportRequest(requestId: string, reply: string, status: SupportStatus): Promise<void> {
    const { error } = await this.supabase.rpc("admin_reply_support_request", {
      p_request_id: requestId,
      p_reply: reply,
      p_status: status,
    });
    if (error) throw error;
  }
}
