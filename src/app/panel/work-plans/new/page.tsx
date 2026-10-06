import { createClient } from "@/lib/supabase/server";
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
  const [personnel, vehicles, projects] = await Promise.all([
    new PersonnelRepository(supabase).list(),
    new VehicleRepository(supabase).list(),
    new ProjectRepository(supabase).listActiveOptions(),
  ]);

  return (
    <WorkPlanEditor
      personnel={personnel}
      vehicles={vehicles}
      projects={projects}
      initialDate={tomorrowISODate()}
    />
  );
}
