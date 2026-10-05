import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SettingsRepository } from "@/modules/settings/settings-repository";
import { SettingsForm } from "@/components/settings/settings-form";
import { UserRepository } from "@/modules/users/user-repository";

export const metadata = {
  title: "Ayarlar",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const [initialTypes, profile] = await Promise.all([
    new SettingsRepository(supabase).getCustomProjectTypes(),
    new UserRepository(supabase).getCurrent(),
  ]);
  if (profile?.role !== "site_chief") notFound();

  return <SettingsForm initialTypes={initialTypes} />;
}
