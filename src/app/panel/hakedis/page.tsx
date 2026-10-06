import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { HakedisRepository } from "@/modules/hakedis/hakedis-repository";
import { listPeriods } from "@/lib/hakedis";
import { HakedisReportView } from "@/components/hakedis/hakedis-report-view";

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
  const userRepository = new UserRepository(supabase);
  const [canView, account, params, profile] = await Promise.all([
    userRepository.canWrite("hakedis"),
    new CompanyRepository(supabase).getMyAccount(),
    searchParams,
    userRepository.getCurrent(),
  ]);
  if (!canView || !account.company) notFound();

  const periods = listPeriods(account.company.payroll_start_day, 12);
  const start = isDate(params.start) ? params.start : periods[0].start;
  const end = isDate(params.end) && params.end >= start ? params.end : periods[0].end;
  const report = await new HakedisRepository(supabase).getReport(start, end);

  return (
    <HakedisReportView
      report={report}
      periods={periods}
      currency={account.company.currency_code}
      canEditPrices={profile?.role === "site_chief"}
    />
  );
}
