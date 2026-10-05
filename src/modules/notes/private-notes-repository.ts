import type { SupabaseClient } from "@supabase/supabase-js";
import type { PrivateNote } from "@/types/note";

export class PrivateNotesRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(): Promise<PrivateNote[]> {
    const { data, error } = await this.supabase.from("private_notes").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as PrivateNote[];
  }

  async create(payload: { title: string; content: string }): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Oturum bulunamadı");
    const { error } = await this.supabase.from("private_notes").insert({ user_id: user.id, title: payload.title.trim(), content: payload.content.trim() });
    if (error) throw error;
  }

  async update(id: string, payload: { title: string; content: string }): Promise<void> {
    const { error } = await this.supabase.from("private_notes").update({ title: payload.title.trim(), content: payload.content.trim() }).eq("id", id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.from("private_notes").delete().eq("id", id);
    if (error) throw error;
  }
}
