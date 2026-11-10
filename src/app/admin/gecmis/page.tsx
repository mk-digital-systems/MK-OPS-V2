import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { PlatformEventsList } from "@/components/admin/platform-events-list";

export const metadata = {
  title: "İşlem Geçmişi",
};

export default async function AdminHistoryPage({ searchParams }: { searchParams: Promise<{ firma?: string }> }) {
  const { firma } = await searchParams;
  const companyId = firma && /^[0-9a-f-]{36}$/i.test(firma) ? firma : null;
  const repository = new AdminRepository(await createClient());
  const events = await repository.platformEvents(companyId, 300);
  return <PlatformEventsList events={events} filtered={Boolean(companyId)} />;
}
