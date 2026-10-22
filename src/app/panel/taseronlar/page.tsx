import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubcontractorRepository } from "@/modules/subcontractors/subcontractor-repository";
import { SubcontractorsManager } from "@/components/subcontractors/subcontractors-manager";
import { canWrite, getCurrentUser, getMyAccount } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Taşeronlar",
};

export default async function SubcontractorsPage() {
  const supabase = await createClient();
  const [profile, canSeePrices, account] = await Promise.all([
    getCurrentUser(),
    canWrite("hakedis"),
    getMyAccount(),
  ]);
  const canManage = profile?.role === "site_chief" || profile?.role === "company_manager" || canSeePrices;
  if (!canManage || !account.company) notFound();

  const repository = new SubcontractorRepository(supabase);
  await repository.chargeVehicleRent();
  const items = await repository.list();
  return <SubcontractorsManager initialItems={items} currency={account.company.currency_code} />;
}
