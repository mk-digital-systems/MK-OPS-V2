import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminCompany, AdminCompanyUser, AdminSupportRequest, SupportStatus } from "@/types/admin";

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
