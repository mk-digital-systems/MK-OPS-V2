import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { HakedisRepository } from "@/modules/hakedis/hakedis-repository";
import { ProjectTypesManager } from "@/components/settings/project-types-manager";

export const metadata = {
  title: "Proje Türleri",
};

/** Proje türleri ve iş kalemleri (birim fiyatlarıyla); yalnızca firma yöneticisi düzenler. */
export default async function ProjectTypesPage() {
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
      <div>
        <Link href="/panel/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Projeler
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Proje Türleri</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Firmanızın yaptığı iş türleri, iş kalemleri (aşamalar), birimleri ve birim fiyatları
        </p>
      </div>
      <ProjectTypesManager types={types} stagePrices={stagePrices} currency={account.company.currency_code} />
    </div>
  );
}
