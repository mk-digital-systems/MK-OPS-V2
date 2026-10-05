import { createClient } from "@/lib/supabase/server";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { WorkPlanEditor } from "@/components/work-plans/work-plan-editor";
import { tomorrowISODate } from "@/lib/constants/project";

export const metadata = {
  title: "Yeni İş Planı",
};

export default async function NewWorkPlanPage() {
  const supabase = await createClient();
  const [personnel, vehicles] = await Promise.all([
    new PersonnelRepository(supabase).list(),
    new VehicleRepository(supabase).list(),
  ]);

  return (
    <WorkPlanEditor
      personnel={personnel}
      vehicles={vehicles}
      initialDate={tomorrowISODate()}
    />
  );
}
