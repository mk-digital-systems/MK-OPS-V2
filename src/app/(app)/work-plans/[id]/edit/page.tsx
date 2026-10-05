import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { WorkPlanEditor } from "@/components/work-plans/work-plan-editor";
import { todayISODate } from "@/lib/constants/project";

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata = {
  title: "İş Planını Düzenle",
};

export default async function EditWorkPlanPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const [plan, personnel, vehicles] = await Promise.all([
    new WorkPlanRepository(supabase).getById(id),
    new PersonnelRepository(supabase).list(),
    new VehicleRepository(supabase).list(),
  ]);

  if (!plan || plan.plan_date < todayISODate()) notFound();

  return (
    <WorkPlanEditor
      personnel={personnel}
      vehicles={vehicles}
      existingPlanId={plan.id}
      initialDate={plan.plan_date}
      initialTeams={plan.teams}
      initialAbsences={plan.absences}
      initialNotes={plan.notes}
    />
  );
}
