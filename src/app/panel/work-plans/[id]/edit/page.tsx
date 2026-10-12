import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { ProjectRepository } from "@/modules/projects/project-repository";
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
  const plan = await new WorkPlanRepository(supabase).getById(id);
  if (!plan || plan.plan_date < todayISODate()) notFound();

  // Plan kendi şubesinin personeli, araçları ve projeleriyle düzenlenir.
  const [personnel, vehicles, projects] = await Promise.all([
    new PersonnelRepository(supabase).list({ branchId: plan.branch_id }),
    new VehicleRepository(supabase).list({ branchId: plan.branch_id }),
    new ProjectRepository(supabase).listActiveOptions(plan.branch_id),
  ]);

  return (
    <WorkPlanEditor
      personnel={personnel}
      vehicles={vehicles}
      projects={projects}
      existingPlanId={plan.id}
      initialDate={plan.plan_date}
      initialTeams={plan.teams}
      initialAbsences={plan.absences}
      initialNotes={plan.notes}
      branchId={plan.branch_id}
    />
  );
}
