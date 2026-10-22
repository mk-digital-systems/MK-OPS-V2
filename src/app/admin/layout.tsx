import { redirect } from "next/navigation";
import { resolveAccountHome } from "@/lib/account-routing";
import { AdminShell } from "@/components/admin/admin-shell";
import { getCurrentUser, getMyAccount } from "@/lib/supabase/request-cache";

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

  return <AdminShell email={profile.email}>{children}</AdminShell>;
}
