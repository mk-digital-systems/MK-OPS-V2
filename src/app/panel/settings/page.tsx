import Link from "next/link";
import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { HakedisRepository } from "@/modules/hakedis/hakedis-repository";
import { CompanyInfoCard } from "@/components/settings/company-info-card";
import { CompanyLogoCard } from "@/components/settings/company-logo-card";
import { HakedisSettingsCard } from "@/components/settings/hakedis-settings-card";
import { ProjectTypesManager } from "@/components/settings/project-types-manager";
import { Button } from "@/components/ui/button";

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
  if (profile?.role !== "site_chief" || !account.company) notFound();

  const stagePrices = await new HakedisRepository(supabase).getStagePrices(
    types.flatMap((type) => type.stages.map((stage) => stage.id))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Ayarlar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Proje türleri, hakediş, firma logosu ve firma bilgileri</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/panel/settings/islem-gecmisi">
            <History className="h-4 w-4" />
            İşlem Geçmişi
          </Link>
        </Button>
      </div>
      <ProjectTypesManager types={types} stagePrices={stagePrices} currency={account.company.currency_code} />
      <HakedisSettingsCard company={account.company} />
      <CompanyLogoCard company={account.company} />
      <CompanyInfoCard company={account.company} />
    </div>
  );
}
