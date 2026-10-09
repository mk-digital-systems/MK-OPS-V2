import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { SubcontractorRepository } from "@/modules/subcontractors/subcontractor-repository";
import { SubcontractorsManager } from "@/components/subcontractors/subcontractors-manager";

export const metadata = {
  title: "Taşeronlar",
};

export default async function SubcontractorsPage() {
  const supabase = await createClient();
  const userRepository = new UserRepository(supabase);
  const [profile, canSeePrices, account] = await Promise.all([
    userRepository.getCurrent(),
    userRepository.canWrite("hakedis"),
    new CompanyRepository(supabase).getMyAccount(),
  ]);
  const canManage = profile?.role === "site_chief" || profile?.role === "company_manager" || canSeePrices;
  if (!canManage || !account.company) notFound();

  const items = await new SubcontractorRepository(supabase).list();
  return <SubcontractorsManager initialItems={items} currency={account.company.currency_code} />;
}
