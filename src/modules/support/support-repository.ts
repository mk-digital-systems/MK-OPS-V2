import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupportRequest, SupportTopic } from "@/types/admin";

export class SupportRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async listOwn(): Promise<SupportRequest[]> {
    const { data, error } = await this.supabase
      .from("support_requests")
      .select("id, company_id, topic, requested_plan, message, status, admin_reply, replied_at, created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as SupportRequest[];
  }

  async create(payload: { topic: SupportTopic; requestedPlan: string | null; message: string }): Promise<SupportRequest> {
    const { data, error } = await this.supabase.rpc("create_support_request", {
      p_topic: payload.topic,
      p_requested_plan: payload.requestedPlan,
      p_message: payload.message,
    });
    if (error) throw error;
    return data as SupportRequest;
  }
}
