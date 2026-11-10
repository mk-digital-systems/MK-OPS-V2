import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { PlanPricesManager } from "@/components/admin/plan-prices-manager";

export const metadata = {
  title: "Fiyat Listesi",
};

export default async function AdminPricesPage() {
  const plans = await new AdminRepository(await createClient()).listPlanPrices();
  return <PlanPricesManager initialPlans={plans} />;
}
