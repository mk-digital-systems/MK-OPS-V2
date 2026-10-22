import { redirect } from "next/navigation";
import { PendingApproval } from "@/components/auth/pending-approval";
import { resolveAccountHome } from "@/lib/account-routing";
import { getCurrentUser, getMyAccount } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Yetki Onayı Bekleniyor",
};

export default async function PendingApprovalPage() {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  const account = await getMyAccount();
  const home = resolveAccountHome(profile, account);
  if (home !== "/pending-approval") redirect(home);
  return (
    <PendingApproval
      companyName={account.company?.name ?? null}
      isSuperAdmin={account.is_super_admin}
    />
  );
}
