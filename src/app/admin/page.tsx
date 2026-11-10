import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { CompaniesManager } from "@/components/admin/companies-manager";

export const metadata = {
  title: "Şirketler",
};

export default async function AdminCompaniesPage() {
  const supabase = await createClient();
  const repository = new AdminRepository(supabase);
  const [companies, catalogs, health, planPrices] = await Promise.all([
    repository.listCompanies(),
    repository.listCatalogs().catch(() => []),
    // Sağlık verisi yoksa (migration henüz uygulanmadıysa) liste yine açılır.
    repository.companyHealth().catch(() => []),
    // Fiyat listesi yoksa (migration henüz uygulanmadıysa) plan atama bölümü gizlenir, sayfa yine açılır.
    repository.listPlanPrices().catch(() => []),
  ]);
  return <CompaniesManager initialCompanies={companies} catalogs={catalogs} health={health} planPrices={planPrices} />;
}
