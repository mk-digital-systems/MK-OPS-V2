import { redirect } from "next/navigation";
import { SubscriptionNotice } from "@/components/auth/subscription-notice";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { resolveAccountHome } from "@/lib/account-routing";

export const metadata = {
  title: "Abonelik",
};

export default async function SubscriptionPage() {
  const supabase = await createClient();
  const profile = await new UserRepository(supabase).getCurrent();
  if (!profile) redirect("/login");
  const account = await new CompanyRepository(supabase).getMyAccount();
  const home = resolveAccountHome(profile, account);
  if (home !== "/subscription" || !account.company) redirect(home);

  return <SubscriptionNotice company={account.company} />;
}
