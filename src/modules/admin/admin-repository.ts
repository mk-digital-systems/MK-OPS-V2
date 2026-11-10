import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdminCompany,
  AdminCompanyHealth,
  AdminCompanyUser,
  AdminInbox,
  AdminSupportRequest,
  Catalog,
  CatalogItem,
  CatalogType,
  CompanyPayment,
  EmailTemplate,
  NewUser,
  NewUserStatusFilter,
  OfficialHoliday,
  PaymentMethod,
  PlanPrice,
  PlatformEvent,
  PublicPlanPrice,
  SupportStatus,
} from "@/types/admin";

export class AdminRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listCompanies(): Promise<AdminCompany[]> {
    const { data, error } = await this.supabase.rpc("admin_list_companies");
    if (error) throw error;
    return (data ?? []) as AdminCompany[];
  }

  async companyHealth(): Promise<AdminCompanyHealth[]> {
    const { data, error } = await this.supabase.rpc("admin_company_health");
    if (error) throw error;
    return (data ?? []) as AdminCompanyHealth[];
  }

  async platformEvents(companyId: string | null = null, limit = 200): Promise<PlatformEvent[]> {
    const { data, error } = await this.supabase.rpc("admin_platform_events", { p_company_id: companyId, p_limit: limit });
    if (error) throw error;
    return (data ?? []) as PlatformEvent[];
  }

  async listOfficialHolidays(year: number): Promise<OfficialHoliday[]> {
    const { data, error } = await this.supabase.rpc("list_official_holidays", { p_year: year });
    if (error) throw error;
    return (data ?? []) as OfficialHoliday[];
  }

  async saveOfficialHoliday(name: string, startDate: string, days: number): Promise<number> {
    const { data, error } = await this.supabase.rpc("admin_save_official_holiday", {
      p_name: name,
      p_start: startDate,
      p_days: days,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }

  async deleteOfficialHoliday(date: string): Promise<void> {
    const { error } = await this.supabase.rpc("admin_delete_official_holiday", { p_date: date });
    if (error) throw error;
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
    siteChiefLimit: number | null;
    managerLimit: number | null;
    accountingLimit: number | null;
    branchLimit: number;
    trialEndsAt: string;
  }): Promise<void> {
    const { error } = await this.supabase.rpc("admin_update_company", {
      p_company_id: payload.companyId,
      p_plan: payload.plan,
      p_plan_ends_at: payload.planEndsAt,
      p_user_limit: payload.userLimit,
      p_trial_ends_at: payload.trialEndsAt,
      p_site_chief_limit: payload.siteChiefLimit,
      p_manager_limit: payload.managerLimit,
      p_accounting_limit: payload.accountingLimit,
      p_branch_limit: payload.branchLimit,
    });
    if (error) throw error;
  }

  // ---------------------------------------------------------------- fiyat listesi
  /** Herkese açık (oturumsuz da çalışır): yalnızca yayındaki paketler. Hata olursa boş liste. */
  async publicPlanPrices(): Promise<PublicPlanPrice[]> {
    const { data, error } = await this.supabase.rpc("public_plan_prices");
    if (error) return [];
    return (data ?? []) as PublicPlanPrice[];
  }

  async listPlanPrices(): Promise<PlanPrice[]> {
    const { data, error } = await this.supabase.rpc("admin_list_plan_prices");
    if (error) throw error;
    return (data ?? []) as PlanPrice[];
  }

  async savePlanPrices(plans: PlanPrice[]): Promise<void> {
    const { error } = await this.supabase.rpc("admin_save_plan_prices", { p_plans: plans });
    if (error) throw error;
  }

  // ---------------------------------------------------------------- plan atama ve ödemeler
  async assignPlan(payload: {
    companyId: string;
    plan: string;
    months: number;
    amount: number;
    paidOn: string;
    method: PaymentMethod;
    note: string | null;
  }): Promise<{ plan_ends_at: string; period_start: string; period_end: string }> {
    const { data, error } = await this.supabase.rpc("admin_assign_plan", {
      p_company_id: payload.companyId,
      p_plan: payload.plan,
      p_months: payload.months,
      p_amount: payload.amount,
      p_paid_on: payload.paidOn,
      p_method: payload.method,
      p_note: payload.note,
    });
    if (error) throw error;
    return data as { plan_ends_at: string; period_start: string; period_end: string };
  }

  async listPayments(year: number | null = null): Promise<CompanyPayment[]> {
    const { data, error } = await this.supabase.rpc("admin_list_payments", { p_year: year });
    if (error) throw error;
    return (data ?? []) as CompanyPayment[];
  }

  async voidPayment(id: string, reason: string): Promise<void> {
    const { error } = await this.supabase.rpc("admin_void_payment", { p_id: id, p_reason: reason });
    if (error) throw error;
  }

  // ---------------------------------------------------------------- yeni kayıtlar, e-posta şablonu, gelen kutusu
  async listNewUsers(status: NewUserStatusFilter, offset = 0, limit = 50): Promise<{ total: number; items: NewUser[] }> {
    const { data, error } = await this.supabase.rpc("admin_list_new_users", { p_status: status, p_offset: offset, p_limit: limit });
    if (error) throw error;
    const result = (data ?? { total: 0, items: [] }) as { total: number; items: NewUser[] };
    return { total: Number(result.total ?? 0), items: result.items ?? [] };
  }

  async setUserOnboarding(userId: string, status: "sent" | "skipped" | null): Promise<void> {
    const { error } = await this.supabase.rpc("admin_set_user_onboarding", { p_user_id: userId, p_status: status });
    if (error) throw error;
  }

  async emailTemplates(): Promise<EmailTemplate[]> {
    const { data, error } = await this.supabase.rpc("admin_get_email_templates");
    if (error) throw error;
    return (data ?? []) as EmailTemplate[];
  }

  async saveEmailTemplate(kind: EmailTemplate["kind"], subject: string, body: string): Promise<number> {
    const { data, error } = await this.supabase.rpc("admin_save_email_template", { p_kind: kind, p_subject: subject, p_body: body });
    if (error) throw error;
    return Number(data ?? 0);
  }

  /** Bildirim özeti. Migration henüz uygulanmadıysa panel bozulmasın diye hata yerine boş döner. */
  async inbox(): Promise<AdminInbox> {
    const { data, error } = await this.supabase.rpc("admin_inbox");
    if (error || !data) return { new_users: 0, open_support: 0, items: [] };
    return data as AdminInbox;
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
