import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharedNote } from "@/types/note";

export class NotesRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(): Promise<SharedNote[]> {
    const { data, error } = await this.supabase.rpc("get_shared_notes");
    if (error) throw error;
    return (data ?? []) as SharedNote[];
  }

  async create(payload: {
    title: string;
    note_date: string;
  }): Promise<SharedNote> {
    const { data, error } = await this.supabase.rpc("create_shared_note", {
      p_title: payload.title,
      p_note_date: payload.note_date,
    });
    if (error) throw error;
    return data as SharedNote;
  }

  async update(noteId: string, payload: { title: string; note_date: string }): Promise<SharedNote> {
    const { data, error } = await this.supabase.rpc("update_shared_note", {
      p_note_id: noteId,
      p_title: payload.title,
      p_note_date: payload.note_date,
    });
    if (error) throw error;
    return data as SharedNote;
  }

  async remove(noteId: string): Promise<void> {
    const { error } = await this.supabase
      .from("shared_notes")
      .delete()
      .eq("id", noteId);
    if (error) throw error;
  }
}
