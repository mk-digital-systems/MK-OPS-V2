import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyVaultNote, CompanyVaultStatus } from "@/types/note";

/**
 * Firmanın şifreli ortak gizli alanı. Notlar yalnızca doğru şifreyle alınan
 * oturum anahtarıyla (30 dk, kullanıldıkça uzar) okunup yazılabilir.
 */
export class CompanyVaultRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async status(): Promise<CompanyVaultStatus> {
    const { data, error } = await this.supabase.rpc("get_company_vault_status");
    if (error) throw error;
    return data as CompanyVaultStatus;
  }

  async setPassword(password: string): Promise<void> {
    const { error } = await this.supabase.rpc("set_company_vault_password", { p_password: password });
    if (error) throw error;
  }

  /** Başarısızsa hata fırlatır (mesaj kullanıcıya gösterilebilir). */
  async unlock(password: string): Promise<string> {
    const { data, error } = await this.supabase.rpc("unlock_company_vault", { p_password: password });
    if (error) throw error;
    const result = data as { ok: boolean; token?: string; error?: string };
    if (!result.ok || !result.token) throw new Error(result.error || "Gizli alan açılamadı");
    return result.token;
  }

  async lock(token: string): Promise<void> {
    await this.supabase.rpc("lock_company_vault", { p_token: token });
  }

  async list(token: string): Promise<CompanyVaultNote[]> {
    const { data, error } = await this.supabase.rpc("list_company_vault_notes", { p_token: token });
    if (error) throw error;
    return (data ?? []) as CompanyVaultNote[];
  }

  async save(token: string, id: string | null, payload: { title: string; content: string }): Promise<void> {
    const { error } = await this.supabase.rpc("save_company_vault_note", {
      p_token: token,
      p_id: id,
      p_title: payload.title.trim(),
      p_content: payload.content.trim(),
    });
    if (error) throw error;
  }

  async remove(token: string, id: string): Promise<void> {
    const { error } = await this.supabase.rpc("delete_company_vault_note", { p_token: token, p_id: id });
    if (error) throw error;
  }

  /** Eski kişisel gizli notu ortak alana taşır. */
  async moveLegacyNote(token: string, noteId: string): Promise<void> {
    const { error } = await this.supabase.rpc("move_private_note_to_vault", { p_token: token, p_note_id: noteId });
    if (error) throw error;
  }
}

/** Oturum süresi dolduysa veya şifre değiştiyse sunucu bu mesajla döner. */
export function isVaultLockedError(error: unknown) {
  return /Gizli alan kilitli/.test((error as Error)?.message ?? "");
}
