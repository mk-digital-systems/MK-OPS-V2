import { redirect } from "next/navigation";
import { SubscriptionNotice } from "@/components/auth/subscription-notice";
import { createClient } from "@/lib/supabase/server";
import { resolveAccountHome } from "@/lib/account-routing";
import { SupportRepository } from "@/modules/support/support-repository";
import { getCurrentUser, getMyAccount } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Abonelik",
};

export default async function SubscriptionPage() {
  const supabase = await createClient();
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  const account = await getMyAccount();
  const home = resolveAccountHome(profile, account);
  if (home !== "/subscription" || !account.company) redirect(home);

  const isSiteChief = profile.role === "site_chief" && profile.is_approved;
  const requests = isSiteChief ? await new SupportRepository(supabase).listOwn() : [];
  return <SubscriptionNotice company={account.company} isSiteChief={isSiteChief} requests={requests} />;
}
