import { createClient } from "@/lib/supabase/server";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { OfficialHolidaysManager } from "@/components/admin/official-holidays-manager";

export const metadata = {
  title: "Resmi Tatiller",
};

export default async function AdminHolidaysPage({ searchParams }: { searchParams: Promise<{ yil?: string }> }) {
  const { yil } = await searchParams;
  const requested = Number(yil);
  const year = Number.isInteger(requested) && requested >= 2026 && requested <= 2100 ? requested : new Date().getFullYear();
  const holidays = await new AdminRepository(await createClient()).listOfficialHolidays(year);
  return <OfficialHolidaysManager year={year} holidays={holidays} />;
}
