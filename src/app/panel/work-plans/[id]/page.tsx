import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { WorkPlanDetailView } from "@/components/work-plans/work-plan-detail-view";
import { todayISODate } from "@/lib/constants/project";
import { canWrite as canWriteCached } from "@/lib/supabase/request-cache";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ whatsapp?: string; draft?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const plan = await new WorkPlanRepository(supabase).getById(id);
  return {
    title: plan ? `İş Planı ${plan.plan_date}` : "İş Planı",
  };
}

export default async function WorkPlanDetailPage({ params, searchParams }: Props) {
  const { id } = await params;
  const query = await searchParams;
  const supabase = await createClient();
  const [plan, canWrite] = await Promise.all([
    new WorkPlanRepository(supabase).getById(id),
    canWriteCached("work_plans"),
  ]);
  if (!plan) notFound();
  return (
    <WorkPlanDetailView
      plan={plan}
      readOnly={!canWrite || plan.plan_date < todayISODate()}
      initialPreviewOpen={query.whatsapp === "1"}
      sourceDraftId={query.draft}
    />
  );
}
