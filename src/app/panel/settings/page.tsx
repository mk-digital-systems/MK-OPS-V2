import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsRepository } from "@/modules/settings/settings-repository";
import { SettingsForm } from "@/components/settings/settings-form";
import { CompanyInfoCard } from "@/components/settings/company-info-card";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";

export const metadata = {
  title: "Ayarlar",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const [initialTypes, profile, account] = await Promise.all([
    new SettingsRepository(supabase).getCustomProjectTypes(),
    new UserRepository(supabase).getCurrent(),
    new CompanyRepository(supabase).getMyAccount(),
  ]);
  if (profile?.role !== "site_chief") notFound();

  return (
    <div className="space-y-6">
      <SettingsForm initialTypes={initialTypes} />
      {account.company && <CompanyInfoCard company={account.company} />}
    </div>
  );
}
