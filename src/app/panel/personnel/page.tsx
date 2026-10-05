import { createClient } from "@/lib/supabase/server";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { AttendanceRepository } from "@/modules/attendance/attendance-repository";
import { PersonnelManager } from "@/components/work-plans/personnel-manager";
import { UserRepository } from "@/modules/users/user-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";

export const metadata = {
  title: "Personel",
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

export default async function PersonnelPage({ searchParams }: Props) {
  const params = await searchParams;
  const personnelId = readParam(params, "personnel");
  const today = new Date();
  const requestedYear = Number(readParam(params, "year"));
  const requestedMonth = Number(readParam(params, "month"));
  const year =
    Number.isInteger(requestedYear) && requestedYear >= 2000
      ? requestedYear
      : today.getFullYear();
  const month =
    Number.isInteger(requestedMonth) &&
    requestedMonth >= 1 &&
    requestedMonth <= 12
      ? requestedMonth
      : today.getMonth() + 1;
  const validPersonnelId =
    personnelId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      personnelId
    )
      ? personnelId
      : null;

  const supabase = await createClient();
  const attendanceRepository = new AttendanceRepository(supabase);
  const [personnel, attendanceSummary, personnelSummaries, assignedVehicles, canWrite] = await Promise.all([
    new PersonnelRepository(supabase).list(),
    validPersonnelId
      ? attendanceRepository.getPersonnelSummary(
          validPersonnelId,
          year,
          month
        )
      : Promise.resolve(null),
    attendanceRepository.getPersonnelListSummaries(year, month),
    new VehicleRepository(supabase).list(),
    new UserRepository(supabase).canWrite("personnel"),
  ]);

  return (
    <PersonnelManager
      initialPersonnel={personnel}
      attendanceSummary={attendanceSummary}
      personnelSummaries={personnelSummaries}
      assignedVehicles={assignedVehicles.filter((vehicle) => vehicle.assigned_personnel_id)}
      summaryYear={year}
      summaryMonth={month}
      readOnly={!canWrite}
    />
  );
}
