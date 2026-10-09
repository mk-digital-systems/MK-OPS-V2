import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { SubcontractorRepository } from "@/modules/subcontractors/subcontractor-repository";
import { TeamsManager } from "@/components/subcontractors/teams-manager";

export const metadata = {
  title: "Ekipler",
};

export default async function TeamsPage() {
  const supabase = await createClient();
  const userRepository = new UserRepository(supabase);
  const [teams, personnel, profile, canSeePrices] = await Promise.all([
    new SubcontractorRepository(supabase).listTeams(),
    new PersonnelRepository(supabase).list(),
    userRepository.getCurrent(),
    userRepository.canWrite("hakedis"),
  ]);
  const canEdit = profile?.role === "site_chief" || profile?.role === "company_manager";
  const canSeeSubcontractors = canEdit || canSeePrices;
  const { data: subcontractors } = canSeeSubcontractors
    ? await supabase.from("subcontractors").select("id, name, is_active").order("name")
    : { data: [] };

  return (
    <TeamsManager
      initialTeams={teams}
      personnel={personnel}
      subcontractors={subcontractors ?? []}
      canEdit={canEdit}
      canSeeSubcontractors={canSeeSubcontractors}
    />
  );
}
