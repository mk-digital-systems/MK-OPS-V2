import { createClient } from "@/lib/supabase/server";
import { ProductionRepository } from "@/modules/productions/production-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { UserRepository } from "@/modules/users/user-repository";
import { ProductionsManager } from "@/components/productions/productions-manager";

export const metadata = { title: "İmalatlar" };
export default async function ProductionsPage() {
  const supabase = await createClient();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  const monthStart = `${today.slice(0,7)}-01`;
  const monthEnd = `${today.slice(0,7)}-${String(new Date(Number(today.slice(0,4)), Number(today.slice(5,7)), 0).getDate()).padStart(2,"0")}`;
  const productionRepository = new ProductionRepository(supabase);
  const [personnel, entries, canWrite] = await Promise.all([
    new PersonnelRepository(supabase).list({ activeOnly: true }),
    productionRepository.listEntries(monthStart, monthEnd),
    new UserRepository(supabase).canWrite("productions"),
  ]);
  return <ProductionsManager initialDate={today} personnel={personnel} initialEntries={entries} readOnly={!canWrite} />;
}
