import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { SubcontractorRepository } from "@/modules/subcontractors/subcontractor-repository";
import { listPeriods } from "@/lib/hakedis";
import { SubcontractorDetail } from "@/components/subcontractors/subcontractor-detail";

export const metadata = {
  title: "Taşeron",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
const read = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function SubcontractorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();

  const supabase = await createClient();
  const userRepository = new UserRepository(supabase);
  const repository = new SubcontractorRepository(supabase);
  const [profile, canSeePrices, account, subcontractor, teams, personnel] = await Promise.all([
    userRepository.getCurrent(),
    userRepository.canWrite("hakedis"),
    new CompanyRepository(supabase).getMyAccount(),
    repository.getById(id),
    repository.listTeams(),
    new PersonnelRepository(supabase).list(),
  ]);
  const canManage = profile?.role === "site_chief" || profile?.role === "company_manager" || canSeePrices;
  if (!canManage || !account.company || !subcontractor) notFound();

  // Hakediş dönemi (firmanın dönem başlangıç günü) ve maaş dökümü ayı (takvim ayı).
  const periods = listPeriods(account.company.payroll_start_day, 12);
  const start = isDate(read(query.start)) ? (read(query.start) as string) : periods[0].start;
  const end = isDate(read(query.end)) && (read(query.end) as string) >= start ? (read(query.end) as string) : periods[0].end;
  const monthParam = read(query.ay);
  const today = new Date();
  const [year, month] = monthParam && /^\d{4}-\d{2}$/.test(monthParam)
    ? monthParam.split("-").map(Number)
    : [today.getFullYear(), today.getMonth() + 1];

  const [statement, categories, payroll] = await Promise.all([
    canSeePrices ? repository.getStatement(id, start, end) : Promise.resolve(null),
    canSeePrices ? repository.listCategories() : Promise.resolve([]),
    repository.getPayroll(id, year, month),
  ]);

  return (
    <SubcontractorDetail
      subcontractor={subcontractor}
      teams={teams.filter((team) => team.subcontractor_id === id)}
      personnel={personnel.filter((person) => person.subcontractor_id === id)}
      allPersonnel={personnel}
      periods={periods}
      start={start}
      end={end}
      statement={statement}
      categories={categories}
      payroll={payroll}
      payrollYear={year}
      payrollMonth={month}
      currency={account.company.currency_code}
      initialTab={read(query.tab) ?? "ozet"}
    />
  );
}
