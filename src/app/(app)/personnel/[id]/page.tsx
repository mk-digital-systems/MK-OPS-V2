import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { AttendanceRepository } from "@/modules/attendance/attendance-repository";
import { PersonnelDetail } from "@/components/work-plans/personnel-detail";
import type { PayrollRow, PersonnelAdvance } from "@/types/attendance";
import { UserRepository } from "@/modules/users/user-repository";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function PersonnelDetailPage({
  params,
  searchParams,
}: Props) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    )
  ) {
    notFound();
  }
  const today = new Date();
  const requestedYear = Number(readParam(query, "year"));
  const requestedMonth = Number(readParam(query, "month"));
  const year =
    Number.isInteger(requestedYear) &&
    requestedYear >= 2000 &&
    requestedYear <= 2100
      ? requestedYear
      : today.getFullYear();
  const month =
    Number.isInteger(requestedMonth) &&
    requestedMonth >= 1 &&
    requestedMonth <= 12
      ? requestedMonth
      : today.getMonth() + 1;

  const supabase = await createClient();
  const personnelRepository = new PersonnelRepository(supabase);
  const attendanceRepository = new AttendanceRepository(supabase);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(year, month, 0).getDate()
  ).padStart(2, "0")}`;
  const [personnel, employmentPeriods, summary, payrollResult, advancesResult, assignedVehicleResult, canWriteAdvances] = await Promise.all([
    personnelRepository.getById(id),
    personnelRepository.listEmploymentPeriods(id),
    attendanceRepository.getPersonnelDetail(id, year, month),
    supabase.rpc("get_monthly_payroll", { p_year: year, p_month: month }),
    supabase
      .from("personnel_advances")
      .select("id, personnel_id, advance_date, amount, notes, created_at")
      .eq("personnel_id", id)
      .gte("advance_date", monthStart)
      .lte("advance_date", monthEnd)
      .order("advance_date", { ascending: false }),
    supabase
      .from("vehicles")
      .select("plate")
      .eq("assigned_personnel_id", id)
      .maybeSingle(),
    new UserRepository(supabase).canWrite("attendance"),
  ]);

  if (!personnel || !summary) notFound();
  const payroll = ((payrollResult.data ?? []) as PayrollRow[]).find(
    (row) => row.personnel_id === id
  ) ?? null;

  return (
    <PersonnelDetail
      personnel={personnel}
      employmentPeriods={employmentPeriods}
      summary={summary}
      year={year}
      month={month}
      payroll={payroll}
      advances={(advancesResult.data ?? []) as PersonnelAdvance[]}
      assignedVehiclePlate={assignedVehicleResult.data?.plate ?? null}
      canWriteAdvances={canWriteAdvances}
    />
  );
}
