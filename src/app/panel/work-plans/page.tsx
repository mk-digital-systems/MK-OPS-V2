import { createClient } from "@/lib/supabase/server";
import { getEffectiveBranchId } from "@/lib/branch-selection";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { WorkPlansHome } from "@/components/work-plans/work-plans-home";
import { todayISODate } from "@/lib/constants/project";
import { canWrite as canWriteCached, getMyBranches } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "İş Planı",
};

export default async function WorkPlansPage() {
  const supabase = await createClient();
  const branchId = await getEffectiveBranchId((await getMyBranches()).branches);
  const repo = new WorkPlanRepository(supabase);
  const today = todayISODate();

  const [todayPlan, pastPlans, drafts, canWrite] = await Promise.all([
    repo.getByDate(today, branchId),
    repo.listPlans(90, branchId),
    repo.listDrafts(branchId),
    canWriteCached("work_plans"),
  ]);

  return (
    <WorkPlansHome
      todayPlan={todayPlan}
      pastPlans={pastPlans}
      drafts={drafts}
      readOnly={!canWrite}
    />
  );
}
