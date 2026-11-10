import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch-selection";
import { DashboardRepository } from "@/modules/dashboard/dashboard-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { HakedisRepository } from "@/modules/hakedis/hakedis-repository";
import { TodayRepository } from "@/modules/dashboard/today-repository";
import { canWrite, getCurrentUser, getMyBranches, getWritableModules } from "@/lib/supabase/request-cache";
import { buildSetupSteps, type SetupCounts, type SetupModule } from "@/lib/setup-guide";

export const metadata = {
  title: "Genel Bakış",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const myBranches = await getMyBranches();
  const branchId = await getSelectedBranchId(myBranches.branches);
  const dashboardRepo = new DashboardRepository(supabase);
  const stats = await dashboardRepo.getStats(branchId);
  const pendingApprovalsPromise = myBranches.can_approve
    ? Promise.all([
        supabase.from("personnel").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
        supabase.from("vehicles").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
        supabase.from("inventory_receipts").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("inventory_requests").select("id", { count: "exact", head: true }).in("status", ["requested", "receipt_review"]),
      ])
    : Promise.resolve(null);
  const canSeeHakedisPromise = canWrite("hakedis");
  const hakedisPromise = canSeeHakedisPromise.then((allowed) =>
    allowed ? new HakedisRepository(supabase).getSummary(branchId) : null
  );
  // İlk kurulum rehberi: yalnızca kullanıcının yazma yetkisi olduğu modüller için ve yalnızca sayım (hafif sorgu).
  const writable = await getWritableModules();
  const countOf = async (module: SetupModule, query: PromiseLike<{ count: number | null }>) =>
    writable.includes(module) ? [module, (await query).count ?? 0] as const : null;
  const setupCountsPromise = Promise.all([
    countOf("projects", supabase.from("projects").select("id", { count: "exact", head: true })),
    countOf("personnel", supabase.from("personnel").select("id", { count: "exact", head: true })),
    countOf("vehicles", supabase.from("vehicles").select("id", { count: "exact", head: true })),
    countOf("work_plans", supabase.from("daily_work_plans").select("id", { count: "exact", head: true })),
    // Pazarlar otomatik üretilir; yalnızca elle girilen puantaj "ilk puantaj" sayılır.
    countOf("attendance", supabase.from("attendance_records").select("id", { count: "exact", head: true }).eq("is_auto_generated", false)),
  ]).then((entries) => Object.fromEntries(entries.filter((entry) => entry !== null)) as Partial<SetupCounts>);

  const [overview, vehicleAlerts, profile, hakedis, today, pendingApprovalResults, setupCounts] = await Promise.all([
    dashboardRepo.getOverview(branchId),
    new VehicleRepository(supabase).getDeadlineAlerts(branchId),
    getCurrentUser(),
    hakedisPromise,
    new TodayRepository(supabase).get(branchId).catch(() => null),
    pendingApprovalsPromise,
    setupCountsPromise.catch(() => null),
  ]);
  const setupSteps = setupCounts ? buildSetupSteps({ projects: 0, personnel: 0, vehicles: 0, work_plans: 0, attendance: 0, ...setupCounts }, writable) : [];
  // "Bugün" özeti; okunamazsa Genel Bakış yine açılır.
  const branchNames = Object.fromEntries(myBranches.branches.map((branch) => [branch.id, branch.name]));
  // Onay bekleyen kayıtlar bütün şubelerden sayılır (Onaylar sayfası da bütün şubeleri gösterir).
  const pendingApprovals = pendingApprovalResults
    ? pendingApprovalResults.reduce((sum, result) => sum + (result.count ?? 0), 0)
    : null;

  return (
    <DashboardView
      stats={stats}
      overview={overview}
      vehicleAlerts={vehicleAlerts}
      canManageTypes={profile?.role === "site_chief"}
      hakedis={hakedis}
      pendingApprovals={pendingApprovals}
      today={today}
      branchNames={branchNames}
      showBranches={myBranches.total_count > 1 && !branchId}
      setupSteps={setupSteps}
    />
  );
}
