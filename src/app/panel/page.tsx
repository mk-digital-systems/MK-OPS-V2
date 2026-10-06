import { createClient } from "@/lib/supabase/server";
import { DashboardRepository } from "@/modules/dashboard/dashboard-repository";
import { VehicleRepository } from "@/modules/vehicles/vehicle-repository";
import { UserRepository } from "@/modules/users/user-repository";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { HakedisRepository } from "@/modules/hakedis/hakedis-repository";

export const metadata = {
  title: "Genel Bakış",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const dashboardRepo = new DashboardRepository(supabase);
  const stats = await dashboardRepo.getStats();
  const userRepository = new UserRepository(supabase);
  const [overview, vehicleAlerts, profile, canSeeHakedis] = await Promise.all([
    dashboardRepo.getOverview(),
    new VehicleRepository(supabase).getDeadlineAlerts(),
    userRepository.getCurrent(),
    userRepository.canWrite("hakedis"),
  ]);
  const hakedis = canSeeHakedis ? await new HakedisRepository(supabase).getSummary() : null;

  return (
    <DashboardView
      stats={stats}
      overview={overview}
      vehicleAlerts={vehicleAlerts}
      canManageTypes={profile?.role === "site_chief"}
      hakedis={hakedis}
    />
  );
}
