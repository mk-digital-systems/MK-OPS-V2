import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch-selection";
import { HakedisRepository } from "@/modules/hakedis/hakedis-repository";
import { listPeriods } from "@/lib/hakedis";
import { HakedisReportView } from "@/components/hakedis/hakedis-report-view";
import { canWrite, getCurrentUser, getMyAccount, getMyBranches } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Hakediş",
};

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export default async function HakedisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const [canView, account, params, profile, myBranches] = await Promise.all([
    canWrite("hakedis"),
    getMyAccount(),
    searchParams,
    getCurrentUser(),
    getMyBranches(),
  ]);
  if (!canView || !account.company) notFound();

  const periods = listPeriods(account.company.payroll_start_day, 12);
  const start = isDate(params.start) ? params.start : periods[0].start;
  const end = isDate(params.end) && params.end >= start ? params.end : periods[0].end;
  const branchId = await getSelectedBranchId(myBranches.branches);
  const report = await new HakedisRepository(supabase).getReport(start, end, branchId);
  const stageIds = report.by_stage.map((row) => row.stage_id).filter((id): id is string => !!id);
  const { data: pozRows } = stageIds.length
    ? await supabase.from("project_type_stages").select("id, poz_code").in("id", stageIds).not("poz_code", "is", null)
    : { data: [] };
  const stagePoz = Object.fromEntries((pozRows ?? []).map((row) => [row.id as string, row.poz_code as string]));

  return (
    <HakedisReportView
      report={report}
      periods={periods}
      currency={account.company.currency_code}
      canEditPrices={profile?.role === "site_chief"}
      stagePoz={stagePoz}
    />
  );
}
