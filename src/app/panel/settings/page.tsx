import Link from "next/link";
import { notFound } from "next/navigation";
import { History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { CompanyInfoCard } from "@/components/settings/company-info-card";
import { CompanyLogoCard } from "@/components/settings/company-logo-card";
import { CompanyVaultCard } from "@/components/settings/company-vault-card";
import { KvkkCard } from "@/components/settings/kvkk-card";
import { CompanyVaultRepository } from "@/modules/notes/company-vault-repository";
import { HakedisSettingsCard } from "@/components/settings/hakedis-settings-card";
import { BranchesCard } from "@/components/settings/branches-card";
import { Button } from "@/components/ui/button";
import { getCurrentUser, getMyAccount, getMyBranches } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Ayarlar",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const [profile, account] = await Promise.all([
    getCurrentUser(),
    getMyAccount(),
  ]);
  if (profile?.role !== "site_chief" || !account.company) notFound();

  const [vaultStatus, myBranches] = await Promise.all([
    new CompanyVaultRepository(supabase).status(),
    getMyBranches(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Ayarlar</h1>
          <p className="mt-1 text-sm text-muted-foreground">Şubeler, hakediş, firma logosu, gizli alan şifresi ve firma bilgileri. Proje türleri Projeler sayfasında.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/panel/settings/islem-gecmisi">
            <History className="h-4 w-4" />
            İşlem Geçmişi
          </Link>
        </Button>
      </div>
      <BranchesCard initialBranches={myBranches.branches} branchLimit={account.company?.branch_limit} />
      <HakedisSettingsCard company={account.company} />
      <CompanyLogoCard company={account.company} />
      <CompanyVaultCard configured={vaultStatus.configured} />
      <CompanyInfoCard company={account.company} />
      <KvkkCard companyName={account.company.name} />
    </div>
  );
}
