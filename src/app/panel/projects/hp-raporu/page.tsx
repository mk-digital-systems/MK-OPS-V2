import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch-selection";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { todayISODate } from "@/lib/constants/project";
import { HpReportView } from "@/components/projects/hp-report-view";
import { getMyBranches } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "HP Raporu",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const isoDate = (value: string | string[] | undefined) =>
  typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;

/** Tamamlanan HP: genel, proje bazında ve seçilen tarih aralığında (paftanın bitiş tarihine göre). */
export default async function HpReportPage({ searchParams }: Props) {
  const params = await searchParams;
  const today = todayISODate();
  let from = isoDate(params.from) ?? `${today.slice(0, 8)}01`;
  let to = isoDate(params.to) ?? today;
  if (from > to) [from, to] = [to, from];

  const supabase = await createClient();
  const branchId = await getSelectedBranchId((await getMyBranches()).branches);
  const report = await new ProjectRepository(supabase).getHpReport(from, to, branchId);

  return <HpReportView report={report} from={from} to={to} />;
}
