import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Personnel,
  PersonnelEmploymentPeriod,
  PersonnelInsert,
  PersonnelUpdate,
} from "@/types/work-plan";

function emptyToNull(value?: string | null): string | null {
  if (value === undefined || value === null || value.trim() === "") return null;
  return value.trim();
}

export class PersonnelRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async getById(id: string): Promise<Personnel | null> {
    const { data, error } = await this.supabase
      .from("personnel")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    return data as Personnel | null;
  }

  /** Varsayılan olarak onay bekleyen personel listelenmez (puantaj, iş planı, seçim listeleri). */
  async list(options?: {
    activeOnly?: boolean;
    search?: string;
    includePending?: boolean;
  }): Promise<Personnel[]> {
    let query = this.supabase
      .from("personnel")
      .select("*")
      .order("full_name", { ascending: true });

    if (options?.activeOnly) {
      query = query.eq("is_active", true);
    }

    if (!options?.includePending) {
      query = query.eq("approval_status", "approved");
    }

    if (options?.search?.trim()) {
      const term = options.search.trim().replace(/[%_]/g, "\\$&");
      query = query.or(
        `full_name.ilike.%${term}%,job_title.ilike.%${term}%,phone.ilike.%${term}%,tc_identity_number.ilike.%${term}%,notes.ilike.%${term}%`
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as Personnel[];
  }

  async create(payload: PersonnelInsert): Promise<Personnel> {
    const { data, error } = await this.supabase
      .from("personnel")
      .insert({
        full_name: payload.full_name.trim(),
        job_title: emptyToNull(payload.job_title),
        phone: emptyToNull(payload.phone),
        tc_identity_number: emptyToNull(payload.tc_identity_number),
        is_active: payload.is_active ?? true,
        employment_start_date: emptyToNull(payload.employment_start_date),
        employment_end_date:
          payload.is_active === false
            ? emptyToNull(payload.employment_end_date)
            : null,
        termination_reason:
          payload.is_active === false
            ? emptyToNull(payload.termination_reason)
            : null,
        monthly_salary: payload.monthly_salary ?? 0,
        notes: emptyToNull(payload.notes),
        subcontractor_id: payload.subcontractor_id || null,
        sgk_paid_by_main: payload.subcontractor_id ? payload.sgk_paid_by_main ?? false : false,
        created_by: payload.created_by ?? null,
        updated_by: payload.updated_by ?? null,
      })
      .select("*")
      .single();

    if (error) throw error;
    return data as Personnel;
  }

  async update(id: string, payload: PersonnelUpdate): Promise<Personnel> {
    const updatePayload: Record<string, unknown> = {
      updated_by: payload.updated_by ?? null,
    };

    if (payload.full_name !== undefined)
      updatePayload.full_name = payload.full_name.trim();
    if (payload.job_title !== undefined)
      updatePayload.job_title = emptyToNull(payload.job_title);
    if (payload.phone !== undefined)
      updatePayload.phone = emptyToNull(payload.phone);
    if (payload.tc_identity_number !== undefined)
      updatePayload.tc_identity_number = emptyToNull(
        payload.tc_identity_number
      );
    if (payload.is_active !== undefined)
      updatePayload.is_active = payload.is_active;
    if (payload.employment_start_date !== undefined)
      updatePayload.employment_start_date = emptyToNull(
        payload.employment_start_date
      );
    if (payload.employment_end_date !== undefined)
      updatePayload.employment_end_date =
        payload.is_active === true
          ? null
          : emptyToNull(payload.employment_end_date);
    if (payload.termination_reason !== undefined || payload.is_active === true)
      updatePayload.termination_reason =
        payload.is_active === true
          ? null
          : emptyToNull(payload.termination_reason);
    if (payload.notes !== undefined)
      updatePayload.notes = emptyToNull(payload.notes);
    if (payload.monthly_salary !== undefined)
      updatePayload.monthly_salary = payload.monthly_salary;
    if (payload.subcontractor_id !== undefined) {
      updatePayload.subcontractor_id = payload.subcontractor_id || null;
      updatePayload.sgk_paid_by_main = payload.subcontractor_id ? payload.sgk_paid_by_main ?? false : false;
    }

    const { data, error } = await this.supabase
      .from("personnel")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return data as Personnel;
  }

  async terminate(
    id: string,
    payload: {
      employment_end_date: string;
      termination_reason: string;
      updated_by: string;
    }
  ): Promise<Personnel> {
    const { data, error } = await this.supabase
      .from("personnel")
      .update({
        is_active: false,
        employment_end_date: payload.employment_end_date,
        termination_reason: payload.termination_reason.trim(),
        updated_by: payload.updated_by,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return data as Personnel;
  }

  async reactivate(
    id: string,
    employmentStartDate: string,
    updatedBy: string
  ): Promise<Personnel> {
    const { data, error } = await this.supabase
      .from("personnel")
      .update({
        is_active: true,
        employment_start_date: employmentStartDate,
        updated_by: updatedBy,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return data as Personnel;
  }

  async listEmploymentPeriods(
    personnelId: string
  ): Promise<PersonnelEmploymentPeriod[]> {
    const { data, error } = await this.supabase
      .from("personnel_employment_periods")
      .select("*")
      .eq("personnel_id", personnelId)
      .order("employment_end_date", { ascending: false });

    if (error) throw error;
    return (data ?? []) as PersonnelEmploymentPeriod[];
  }

  /** Şef / firma yöneticisi: bekleyen kaydı onaylar; ret kaydı siler. */
  async review(id: string, approve: boolean): Promise<void> {
    const { error } = await this.supabase.rpc("review_pending_record", {
      p_kind: "personnel",
      p_id: id,
      p_approve: approve,
    });
    if (error) throw error;
  }

  /** Personeli taşeron yapar (pay yüzdesiyle) ya da taşeronluğu kaldırır; taşeron hesabı arka planda açılır. */
  async setSubcontractor(
    id: string,
    enabled: boolean,
    details?: { share_percent: number; iban?: string | null; tax_number?: string | null }
  ): Promise<void> {
    const { error } = await this.supabase.rpc("set_personnel_subcontractor", {
      p_personnel_id: id,
      p_enabled: enabled,
      p_share_percent: details?.share_percent ?? null,
      p_iban: details?.iban ?? null,
      p_tax_number: details?.tax_number ?? null,
    });
    if (error) throw error;
  }

  async deleteInactiveWithoutEarnedDays(id: string): Promise<void> {
    const { error } = await this.supabase.rpc(
      "delete_inactive_personnel_without_earned_days",
      { p_personnel_id: id }
    );
    if (error) throw error;
  }
}
