import { createClient } from "@/lib/supabase/server";
import { AttendanceRepository } from "@/modules/attendance/attendance-repository";
import { MonthlyAttendanceTable } from "@/components/attendance/monthly-attendance-table";
import type { PersonnelActivityFilter } from "@/types/attendance";
import type { AttendanceStatus } from "@/types/attendance";
import { UserRepository } from "@/modules/users/user-repository";

export const metadata = {
  title: "Puantaj",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function AttendancePage({ searchParams }: Props) {
  const params = await searchParams;
  const today = new Date();
  const requestedYear = Number(readParam(params, "year"));
  const requestedMonth = Number(readParam(params, "month"));
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
  const stateParam = readParam(params, "state");
  const activeFilter: PersonnelActivityFilter =
    stateParam === "passive" || stateParam === "all" ? stateParam : "active";
  const search = readParam(params, "q") ?? "";
  const statusParam = readParam(params, "status");
  const statusFilter: AttendanceStatus | "all" =
    statusParam === "worked" ||
    statusParam === "absent" ||
    statusParam === "unexcused_absence" ||
    statusParam === "leave" ||
    statusParam === "medical_report" ||
    statusParam === "weekly_rest"
      ? statusParam
      : "all";

  const supabase = await createClient();
  const attendanceRepository = new AttendanceRepository(supabase);
  try {
    await attendanceRepository.ensureSundays(year, month);
  } catch {
    // Yetkisiz kullanıcılar puantajı salt okunur görüntülemeye devam edebilir.
  }
  const [data, exportData, monthNotes, canWrite] = await Promise.all([
    attendanceRepository.getMonth({
      year,
      month,
      activeFilter,
      search,
      statusFilter,
    }),
    attendanceRepository.getMonth({
      year,
      month,
      activeFilter: "active",
      search: "",
      statusFilter: "all",
    }),
    attendanceRepository.getMonthNotes(year, month),
    new UserRepository(supabase).canWrite("attendance"),
  ]);

  return (
    <MonthlyAttendanceTable
      initialData={data}
      exportPersonnel={exportData.personnel}
      initialMonthNotes={monthNotes}
      initialSearch={search}
      initialActivityFilter={activeFilter}
      initialStatusFilter={statusFilter}
      readOnly={!canWrite}
    />
  );
}
