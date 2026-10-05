import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { resolveAccountHome } from "@/lib/account-routing";
import { AdminShell } from "@/components/admin/admin-shell";

export const metadata = {
  title: {
    default: "Süper Admin",
    template: "%s · Süper Admin",
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const profile = await new UserRepository(supabase).getCurrent();
  if (!profile) redirect("/login");
  const account = await new CompanyRepository(supabase).getMyAccount();
  if (!account.is_super_admin) redirect(resolveAccountHome(profile, account));

  return <AdminShell email={profile.email}>{children}</AdminShell>;
}
