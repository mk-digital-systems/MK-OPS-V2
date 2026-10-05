import { createClient } from "@/lib/supabase/server";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { WorkPlansHome } from "@/components/work-plans/work-plans-home";
import { todayISODate } from "@/lib/constants/project";
import { UserRepository } from "@/modules/users/user-repository";

export const metadata = {
  title: "İş Planı",
};

export default async function WorkPlansPage() {
  const supabase = await createClient();
  const repo = new WorkPlanRepository(supabase);
  const today = todayISODate();

  const [todayPlan, pastPlans, drafts, canWrite] = await Promise.all([
    repo.getByDate(today),
    repo.listPlans(90),
    repo.listDrafts(),
    new UserRepository(supabase).canWrite("work_plans"),
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
