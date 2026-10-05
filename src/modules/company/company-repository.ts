import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountInfo } from "@/types/auth";

export class CompanyRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getMyAccount(): Promise<AccountInfo> {
    const { data, error } = await this.supabase.rpc("get_my_company");
    if (error) throw error;
    return (data as AccountInfo | null) ?? { is_super_admin: false, company: null };
  }

  async createCompany(name: string): Promise<AccountInfo> {
    const { data, error } = await this.supabase.rpc("create_company", {
      p_name: name,
    });
    if (error) throw error;
    return data as AccountInfo;
  }

  /** Hatalı denemeler sayılsın diye RPC hata yerine sonuç döndürür. */
  async joinCompany(name: string, joinCode: string): Promise<string> {
    const { data, error } = await this.supabase.rpc("join_company", {
      p_name: name,
      p_join_code: joinCode,
    });
    if (error) throw error;
    const result = data as { ok: boolean; error?: string; company_name?: string };
    if (!result.ok) throw new Error(result.error || "Şirkete katılınamadı");
    return result.company_name ?? name;
  }

  async leavePendingCompany(): Promise<void> {
    const { error } = await this.supabase.rpc("leave_pending_company");
    if (error) throw error;
  }

  async rejectJoinRequest(userId: string): Promise<void> {
    const { error } = await this.supabase.rpc("reject_join_request", {
      p_user_id: userId,
    });
    if (error) throw error;
  }
}
