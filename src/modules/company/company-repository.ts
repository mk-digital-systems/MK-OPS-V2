import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountInfo } from "@/types/auth";
import type { ProjectAddon } from "@/types/project";
import { COMPANY_LOGO_BUCKET } from "@/lib/report-brand";

const LOGO_EXTENSIONS: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export class CompanyRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getMyAccount(): Promise<AccountInfo> {
    const { data, error } = await this.supabase.rpc("get_my_company");
    if (error) throw error;
    return (data as AccountInfo | null) ?? { is_super_admin: false, company: null };
  }

  /**
   * Firmada açık HP / Kurumsal ekranları: firmaya atanan kataloglardaki türlerin ekran tipleri
   * (geçiş için eski eklenti listesi de sayılır).
   */
  async getProjectAddons(): Promise<ProjectAddon[]> {
    const [company, catalogTypes] = await Promise.all([
      this.supabase.from("companies").select("project_addons").maybeSingle(),
      this.supabase.from("catalog_project_types").select("screen").neq("screen", "standard"),
    ]);
    // Migration'lar kurulmadan önce sütun / tablo yoksa kapalı say.
    const legacy = company.error ? [] : ((company.data?.project_addons as ProjectAddon[] | null) ?? []);
    const fromCatalogs = catalogTypes.error ? [] : (catalogTypes.data ?? []).map((row) => row.screen as ProjectAddon);
    return [...new Set([...legacy, ...fromCatalogs])];
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

  /** Yeni logoyu firma klasörüne yükler, firmaya bağlar ve eski dosyayı siler. */
  async uploadLogo(companyId: string, file: File, previousPath: string | null): Promise<string> {
    const extension = LOGO_EXTENSIONS[file.type];
    if (!extension) throw new Error("Logo PNG, JPG veya WEBP olmalı");
    const path = `${companyId}/logo-${Date.now()}.${extension}`;
    const { error: uploadError } = await this.supabase.storage
      .from(COMPANY_LOGO_BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "31536000", upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await this.supabase.rpc("set_company_logo", { p_path: path });
    if (error) {
      await this.supabase.storage.from(COMPANY_LOGO_BUCKET).remove([path]);
      throw error;
    }
    if (previousPath) await this.supabase.storage.from(COMPANY_LOGO_BUCKET).remove([previousPath]);
    return path;
  }

  async removeLogo(previousPath: string | null): Promise<void> {
    const { error } = await this.supabase.rpc("set_company_logo", { p_path: null });
    if (error) throw error;
    if (previousPath) await this.supabase.storage.from(COMPANY_LOGO_BUCKET).remove([previousPath]);
  }

  async rejectJoinRequest(userId: string): Promise<void> {
    const { error } = await this.supabase.rpc("reject_join_request", {
      p_user_id: userId,
    });
    if (error) throw error;
  }
}
