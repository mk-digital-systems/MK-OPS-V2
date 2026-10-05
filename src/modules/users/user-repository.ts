import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type {
  CompanyManagerPermissions,
  PermissionModule,
  UserProfile,
  UserRole,
} from "@/types/auth";

export class UserRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getCurrent(): Promise<UserProfile | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();
    if (error) throw error;
    return data as UserProfile | null;
  }

  async list(): Promise<UserProfile[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as UserProfile[];
  }

  async assignRole(
    userId: string,
    role: Exclude<UserRole, "site_chief">
  ): Promise<UserProfile> {
    const { data, error } = await this.supabase.rpc("assign_user_role", {
      p_user_id: userId,
      p_role: role,
    });
    if (error) throw error;
    return data as UserProfile;
  }

  async canWrite(module: PermissionModule): Promise<boolean> {
    const { data, error } = await this.supabase.rpc(
      "has_module_write_permission",
      { p_module: module }
    );
    if (error) throw error;
    return data === true;
  }

  async getWritableModules(): Promise<PermissionModule[]> {
    const modules: PermissionModule[] = ["projects","work_plans","personnel","attendance","vehicles","inventory","custody","productions"];
    const results = await Promise.all(modules.map(async (module) => ({ module, allowed: await this.canWrite(module) })));
    return results.filter((item) => item.allowed).map((item) => item.module);
  }

  async listCompanyManagerPermissions(): Promise<
    CompanyManagerPermissions[]
  > {
    const { data, error } = await this.supabase
      .from("company_manager_permissions")
      .select("*");
    if (error) throw error;
    return (data ?? []) as CompanyManagerPermissions[];
  }

  async setCompanyManagerPermission(
    userId: string,
    module: PermissionModule,
    enabled: boolean
  ): Promise<CompanyManagerPermissions> {
    const { data, error } = await this.supabase.rpc(
      "set_company_manager_permission",
      {
        p_user_id: userId,
        p_module: module,
        p_enabled: enabled,
      }
    );
    if (error) throw error;
    return data as CompanyManagerPermissions;
  }

  async updateOwnProfile(payload: {
    full_name: string;
    job_title?: string | null;
    avatar_path?: string | null;
  }): Promise<UserProfile> {
    const { data, error } = await this.supabase.rpc("update_own_profile", {
      p_full_name: payload.full_name,
      p_job_title: payload.job_title || null,
      p_avatar_path: payload.avatar_path || null,
    });
    if (error) throw error;
    return data as UserProfile;
  }

  async deleteUser(userId: string): Promise<void> {
    const {
      data: { session },
      error: sessionError,
    } = await this.supabase.auth.getSession();
    if (sessionError || !session?.access_token) {
      throw new Error("Oturum süresi dolmuş. Lütfen yeniden giriş yapın.");
    }

    const { data, error } = await this.supabase.functions.invoke(
      "delete-user",
      {
        body: { user_id: userId },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      }
    );
    if (error instanceof FunctionsHttpError) {
      const body = await readFunctionError(error.context);
      throw new Error(body || "Kullanıcı silme isteği reddedildi.");
    }
    if (error instanceof FunctionsRelayError) {
      throw new Error(
        "Kullanıcı silme servisine ulaşılamadı. Edge Function deploy durumunu kontrol edin."
      );
    }
    if (error instanceof FunctionsFetchError) {
      throw new Error(
        "Kullanıcı silme servisine bağlantı kurulamadı. Ağ ve CORS ayarlarını kontrol edin."
      );
    }
    if (error) throw new Error(error.message || "Kullanıcı silinemedi.");
    if (data?.error) throw new Error(data.error);
  }

  async createAvatarUrl(
    avatarPath: string | null | undefined,
    expiresIn = 3600
  ): Promise<string | null> {
    if (!avatarPath) return null;
    const { data, error } = await this.supabase.storage
      .from("profile-avatars")
      .createSignedUrl(avatarPath, expiresIn);
    if (error) return null;
    return data.signedUrl;
  }
}

async function readFunctionError(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}
