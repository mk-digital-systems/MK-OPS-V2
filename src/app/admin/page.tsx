import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { CompaniesManager } from "@/components/admin/companies-manager";

export const metadata = {
  title: "Şirketler",
};

export default async function AdminCompaniesPage() {
  const supabase = await createClient();
  const repository = new AdminRepository(supabase);
  const [companies, catalogs] = await Promise.all([repository.listCompanies(), repository.listCatalogs().catch(() => [])]);
  return <CompaniesManager initialCompanies={companies} catalogs={catalogs} />;
}
