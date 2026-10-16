import type { SupabaseClient } from "@supabase/supabase-js";
import type { Branch, MyBranches } from "@/types/branch";

export class BranchRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getMine(): Promise<MyBranches> {
    const { data, error } = await this.supabase.rpc("get_my_branches");
    if (error) throw error;
    return (data as MyBranches | null) ?? { branches: [], total_count: 0, head_office: false, can_approve: false, assignments: null };
  }

  /** Yalnızca firma yöneticisi. */
  async create(name: string, sortOrder: number): Promise<Branch> {
    const { data, error } = await this.supabase
      .from("branches")
      .insert({ name: name.trim(), sort_order: sortOrder })
      .select("id, name, is_main, sort_order")
      .single();
    if (error) throw error;
    return data as Branch;
  }

  async rename(id: string, name: string): Promise<void> {
    const { error } = await this.supabase.from("branches").update({ name: name.trim() }).eq("id", id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.from("branches").delete().eq("id", id);
    if (error) throw error;
  }

  /** Personelin/aracın şubesini geçiş tarihiyle değiştirir (firma yöneticisi, Merkez şefi). */
  async changeRecordBranch(kind: "personnel" | "vehicle", id: string, branchId: string, startDate: string): Promise<void> {
    const { error } = await this.supabase.rpc("change_record_branch", { p_kind: kind, p_id: id, p_branch_id: branchId, p_start_date: startDate });
    if (error) throw error;
  }

  /** Şantiye şefine Merkez yetkisi verir/kaldırır (yalnızca firma yöneticisi). */
  /** Toplu şube tayini: hepsi ya birlikte taşınır ya hiçbiri. */
  async changeRecordsBranch(kind: "personnel" | "vehicle", ids: string[], branchId: string, startDate: string): Promise<number> {
    const { data, error } = await this.supabase.rpc("change_records_branch", { p_kind: kind, p_ids: ids, p_branch_id: branchId, p_start_date: startDate });
    if (error) throw error;
    return data as number;
  }

  async setHeadOffice(userId: string, enabled: boolean): Promise<void> {
    const { error } = await this.supabase.rpc("set_user_head_office", { p_user_id: userId, p_enabled: enabled });
    if (error) throw error;
  }

  /** Şef/muhasebe kullanıcısının şubeleri (yalnızca firma yöneticisi). */
  async setUserBranches(userId: string, branchIds: string[]): Promise<void> {
    const { error } = await this.supabase.rpc("set_user_branches", { p_user_id: userId, p_branch_ids: branchIds });
    if (error) throw error;
  }
}

export function branchErrorMessage(error: unknown): string {
  const message = (error as { message?: string })?.message ?? "";
  const code = (error as { code?: string })?.code;
  if (code === "23505" || /duplicate key/.test(message)) return "Bu şube adı zaten kullanılıyor.";
  if (code === "23503" || /foreign key/.test(message)) return "Bu şubede kayıt var (proje, personel, araç veya depo); önce kayıtları başka şubeye taşıyın.";
  return message || "İşlem yapılamadı";
}
