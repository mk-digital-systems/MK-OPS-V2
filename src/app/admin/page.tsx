import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { CompaniesManager } from "@/components/admin/companies-manager";

export const metadata = {
  title: "Şirketler",
};

export default async function AdminCompaniesPage() {
  const supabase = await createClient();
  const companies = await new AdminRepository(supabase).listCompanies();
  return <CompaniesManager initialCompanies={companies} />;
}
