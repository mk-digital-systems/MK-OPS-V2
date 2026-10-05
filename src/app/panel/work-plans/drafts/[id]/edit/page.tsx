import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { WorkPlanEditor } from "@/components/work-plans/work-plan-editor";

type Props = { params: Promise<{ id: string }> };

export const metadata = { title: "İş Planı Taslağını Düzenle" };

export default async function EditWorkPlanDraftPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const repo = new WorkPlanRepository(supabase);
  const [draft, personnel, vehicles] = await Promise.all([
    repo.getDraft(id),
    new PersonnelRepository(supabase).list(),
    new VehicleRepository(supabase).list(),
  ]);
  if (!draft) notFound();
  return (
    <WorkPlanEditor
      personnel={personnel}
      vehicles={vehicles}
      draftId={draft.id}
      initialDate={draft.plan_date}
      initialTeams={draft.teams}
      initialAbsences={draft.absences}
      initialNotes={draft.notes}
    />
  );
}
