import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppNotification } from "@/types/notification";

export class NotificationRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async list(): Promise<AppNotification[]> {
    const { data, error } = await this.supabase.rpc("get_my_notifications");
    if (error) throw error;
    return (data ?? []) as AppNotification[];
  }

  async markRead(keys: string[]): Promise<void> {
    const { error } = await this.supabase.rpc("mark_notifications_read", { p_keys: keys });
    if (error) throw error;
  }
}
