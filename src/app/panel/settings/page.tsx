import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { CompanyInfoCard } from "@/components/settings/company-info-card";
import { ProjectTypesManager } from "@/components/settings/project-types-manager";

export const metadata = {
  title: "Ayarlar",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const [profile, account, types] = await Promise.all([
    new UserRepository(supabase).getCurrent(),
    new CompanyRepository(supabase).getMyAccount(),
    new ProjectRepository(supabase).listTypes(true),
  ]);
  if (profile?.role !== "site_chief") notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Ayarlar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Proje türleri ve firma bilgileri</p>
      </div>
      <ProjectTypesManager types={types} />
      {account.company && <CompanyInfoCard company={account.company} />}
    </div>
  );
}
