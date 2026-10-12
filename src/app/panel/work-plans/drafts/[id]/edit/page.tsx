import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { WorkPlanEditor } from "@/components/work-plans/work-plan-editor";

type Props = { params: Promise<{ id: string }> };

export const metadata = { title: "İş Planı Taslağını Düzenle" };

export default async function EditWorkPlanDraftPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const repo = new WorkPlanRepository(supabase);
  const draft = await repo.getDraft(id);
  if (!draft) notFound();
  // Taslak kendi şubesinin personeli, araçları ve projeleriyle düzenlenir.
  const [personnel, vehicles, projects] = await Promise.all([
    new PersonnelRepository(supabase).list({ branchId: draft.branch_id }),
    new VehicleRepository(supabase).list({ branchId: draft.branch_id }),
    new ProjectRepository(supabase).listActiveOptions(draft.branch_id),
  ]);
  return (
    <WorkPlanEditor
      personnel={personnel}
      vehicles={vehicles}
      projects={projects}
      draftId={draft.id}
      initialDate={draft.plan_date}
      initialTeams={draft.teams}
      initialAbsences={draft.absences}
      initialNotes={draft.notes}
      branchId={draft.branch_id}
    />
  );
}
