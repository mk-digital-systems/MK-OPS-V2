import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { NewUsersList } from "@/components/admin/new-users-list";
import type { NewUserStatusFilter } from "@/types/admin";

export const metadata = {
  title: "Yeni Kayıtlar",
};

const PAGE_SIZE = 25;

export default async function AdminNewUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ durum?: string; sayfa?: string }>;
}) {
  const { durum, sayfa } = await searchParams;
  const status: NewUserStatusFilter = durum === "sent" || durum === "all" ? durum : "pending";
  const page = Math.max(1, Math.floor(Number(sayfa)) || 1);
  const repository = new AdminRepository(await createClient());
  const [result, templates] = await Promise.all([
    repository.listNewUsers(status, (page - 1) * PAGE_SIZE, PAGE_SIZE),
    repository.emailTemplates().catch(() => []),
  ]);
  return (
    <NewUsersList
      users={result.items}
      total={result.total}
      status={status}
      page={page}
      pageSize={PAGE_SIZE}
      template={templates.find((item) => item.kind === "welcome") ?? null}
    />
  );
}
