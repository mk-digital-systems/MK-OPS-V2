import { redirect } from "next/navigation";
import { resolveAccountHome } from "@/lib/account-routing";
import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentUser, getMyAccount } from "@/lib/supabase/request-cache";
import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";

export const metadata = {
  title: {
    default: "Süper Admin",
    template: "%s · Süper Admin",
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  const account = await getMyAccount();
  if (!account.is_super_admin) redirect(resolveAccountHome(profile, account));

  // Menü rozetleri (yeni kayıt, açık destek talebi). Hata olursa panel yine açılır.
  const inbox = await new AdminRepository(await createClient()).inbox();

  return (
    <AdminShell email={profile.email} initialCounts={{ new_users: inbox.new_users, open_support: inbox.open_support }}>
      {children}
    </AdminShell>
  );
}
