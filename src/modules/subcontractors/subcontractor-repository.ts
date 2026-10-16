import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Subcontractor,
  SubcontractorCategory,
  SubcontractorClosure,
  SubcontractorListItem,
  SubcontractorStatement,
  SubcontractorTransaction,
} from "@/types/subcontractor";
import type { PayrollRow } from "@/types/attendance";

const clean = (value?: string | null) => (value?.trim() ? value.trim() : null);

export class SubcontractorRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  // --- Taşeronlar ---------------------------------------------------------------------------

  /** Biten ayların araç kiralarını taşeronun hesabına yazar (idempotent; yetkisi yoksa sessizce geçer). */
  async chargeVehicleRent(): Promise<void> {
    await this.supabase.rpc("charge_vehicle_rent");
  }

  async list(): Promise<SubcontractorListItem[]> {
    const { data, error } = await this.supabase.rpc("list_subcontractors");
    if (error) throw error;
    return (data ?? []) as SubcontractorListItem[];
  }

  async getById(id: string): Promise<Subcontractor | null> {
    const { data, error } = await this.supabase.from("subcontractors").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data as Subcontractor | null;
  }

  async getStatement(id: string, start: string, end: string): Promise<SubcontractorStatement> {
    const { data, error } = await this.supabase.rpc("get_subcontractor_statement", {
      p_subcontractor_id: id,
      p_start: start,
      p_end: end,
    });
    if (error) throw error;
    return data as SubcontractorStatement;
  }

  /** Kapatılmış dönemler (en yeni önce). */
  async listClosures(id: string): Promise<SubcontractorClosure[]> {
    const { data, error } = await this.supabase
      .from("subcontractor_period_closures")
      .select("id, period_start, period_end, closed_at")
      .eq("subcontractor_id", id)
      .order("period_start", { ascending: false });
    if (error) throw error;
    return (data ?? []) as SubcontractorClosure[];
  }

  /** Dönem kapalıysa kapanıştaki ekstre; değilse null. */
  async getClosedStatement(id: string, start: string, end: string): Promise<{ closure: SubcontractorClosure; statement: SubcontractorStatement } | null> {
    const { data, error } = await this.supabase
      .from("subcontractor_period_closures")
      .select("id, period_start, period_end, closed_at, statement")
      .eq("subcontractor_id", id)
      .eq("period_start", start)
      .eq("period_end", end)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const { statement, ...closure } = data as SubcontractorClosure & { statement: SubcontractorStatement };
    return { closure, statement };
  }

  async closePeriod(id: string, start: string, end: string): Promise<void> {
    const { error } = await this.supabase.rpc("close_subcontractor_period", { p_subcontractor_id: id, p_start: start, p_end: end });
    if (error) throw error;
  }

  async reopenPeriod(closureId: string): Promise<void> {
    const { error } = await this.supabase.rpc("reopen_subcontractor_period", { p_closure_id: closureId });
    if (error) throw error;
  }

  /** Taşeron personelinin puantaja dayalı aylık maaş dökümü (takvim ayı). */
  async getPayroll(id: string, year: number, month: number): Promise<PayrollRow[]> {
    const { data, error } = await this.supabase.rpc("get_monthly_payroll", {
      p_year: year,
      p_month: month,
      p_subcontractor_id: id,
    });
    if (error) throw error;
    return (data ?? []) as PayrollRow[];
  }

  // --- Harcama / ödemeler --------------------------------------------------------------------

  async listCategories(): Promise<SubcontractorCategory[]> {
    const { data, error } = await this.supabase
      .from("subcontractor_expense_categories")
      .select("id, name, sort_order")
      .order("sort_order")
      .order("name");
    if (error) throw error;
    return (data ?? []) as SubcontractorCategory[];
  }

  async addCategory(name: string, sortOrder: number): Promise<SubcontractorCategory> {
    const { data, error } = await this.supabase
      .from("subcontractor_expense_categories")
      .insert({ name: name.trim(), sort_order: sortOrder })
      .select("id, name, sort_order")
      .single();
    if (error) throw error;
    return data as SubcontractorCategory;
  }

  async removeCategory(id: string): Promise<void> {
    const { error } = await this.supabase.from("subcontractor_expense_categories").delete().eq("id", id);
    if (error) throw error;
  }

  async saveTransaction(
    id: string | null,
    input: Pick<SubcontractorTransaction, "subcontractor_id" | "category_id" | "transaction_date" | "amount" | "notes">,
    userId: string
  ): Promise<void> {
    const payload = { ...input, notes: clean(input.notes), updated_by: userId };
    const { error } = id
      ? await this.supabase.from("subcontractor_transactions").update(payload).eq("id", id)
      : await this.supabase.from("subcontractor_transactions").insert({ ...payload, created_by: userId });
    if (error) throw error;
  }

  async removeTransaction(id: string): Promise<void> {
    const { error } = await this.supabase.from("subcontractor_transactions").delete().eq("id", id);
    if (error) throw error;
  }

}

/** Veritabanı hatalarını kullanıcıya anlaşılır mesaja çevirir. */
export function subcontractorErrorMessage(error: unknown): string {
  const message = (error as { message?: string })?.message ?? "";
  const code = (error as { code?: string })?.code;
  if (code === "23505" || /duplicate key/.test(message)) {
    return "Bu ad zaten kullanılıyor.";
  }
  if (code === "23503" || /foreign key/.test(message)) {
    return "Bu kayıt başka kayıtlarda kullanılıyor; silmek yerine pasife alın.";
  }
  if (/share_percent/.test(message)) return "Pay yüzdesi 0'dan büyük, en fazla 100 olmalı.";
  return message || "İşlem yapılamadı";
}
