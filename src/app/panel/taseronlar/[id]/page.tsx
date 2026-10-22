import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { SubcontractorRepository } from "@/modules/subcontractors/subcontractor-repository";
import { listPeriods } from "@/lib/hakedis";
import { SubcontractorDetail } from "@/components/subcontractors/subcontractor-detail";
import { canWrite, getCurrentUser, getMyAccount } from "@/lib/supabase/request-cache";

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
  const repository = new SubcontractorRepository(supabase);
  // Biten ayların araç kirası taşeronun hesabına yazılır (bir kez; tekrar çağrılması zararsız).
  await repository.chargeVehicleRent();
  const [profile, canSeePrices, account, subcontractor, personnel] = await Promise.all([
    getCurrentUser(),
    canWrite("hakedis"),
    getMyAccount(),
    repository.getById(id),
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

  const [liveStatement, categories, payroll, closures, closed] = await Promise.all([
    canSeePrices ? repository.getStatement(id, start, end) : Promise.resolve(null),
    canSeePrices ? repository.listCategories() : Promise.resolve([]),
    repository.getPayroll(id, year, month),
    canSeePrices ? repository.listClosures(id) : Promise.resolve([]),
    canSeePrices ? repository.getClosedStatement(id, start, end) : Promise.resolve(null),
  ]);
  // Kapatılmış dönem hep kapanıştaki kayıttan gösterilir; sonradan değişen bakiye uyarı olur.
  const statement = closed ? closed.statement : liveStatement;
  const closedInfo =
    closed && liveStatement
      ? { closure: closed.closure, changed: Number(liveStatement.balance) !== Number(closed.statement.balance), liveBalance: Number(liveStatement.balance) }
      : closed
        ? { closure: closed.closure, changed: false, liveBalance: Number(closed.statement.balance) }
        : null;

  return (
    <SubcontractorDetail
      subcontractor={subcontractor}
      personnel={personnel.filter((person) => person.subcontractor_id === id)}
      periods={periods}
      start={start}
      end={end}
      statement={statement}
      closures={closures}
      closedInfo={closedInfo}
      canReopen={profile?.role === "site_chief"}
      categories={categories}
      payroll={payroll}
      payrollYear={year}
      payrollMonth={month}
      currency={account.company.currency_code}
      initialTab={read(query.tab) ?? "ozet"}
    />
  );
}
