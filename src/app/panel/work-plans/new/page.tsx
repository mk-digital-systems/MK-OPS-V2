import { createClient } from "@/lib/supabase/server";
import { BranchRepository } from "@/modules/branches/branch-repository";
import { getEffectiveBranchId } from "@/lib/branch-selection";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { WorkPlanEditor } from "@/components/work-plans/work-plan-editor";
import { tomorrowISODate } from "@/lib/constants/project";

export const metadata = {
  title: "Yeni İş Planı",
};

export default async function NewWorkPlanPage() {
  const supabase = await createClient();
  const branchId = await getEffectiveBranchId((await new BranchRepository(supabase).getMine()).branches);
  const [personnel, vehicles, projects] = await Promise.all([
    new PersonnelRepository(supabase).list({ branchId }),
    new VehicleRepository(supabase).list({ branchId }),
    new ProjectRepository(supabase).listActiveOptions(branchId),
  ]);

  return (
    <WorkPlanEditor
      personnel={personnel}
      vehicles={vehicles}
      projects={projects}
      initialDate={tomorrowISODate()}
      branchId={branchId}
    />
  );
}
