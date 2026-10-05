import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { SupportInbox } from "@/components/admin/support-inbox";

export const metadata = {
  title: "Destek Talepleri",
};

export default async function AdminSupportPage() {
  const supabase = await createClient();
  const requests = await new AdminRepository(supabase).listSupportRequests();
  return <SupportInbox initialRequests={requests} />;
}
