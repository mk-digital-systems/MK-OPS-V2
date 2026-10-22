import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch-selection";
import { ProductionRepository } from "@/modules/productions/production-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { ProductionsManager } from "@/components/productions/productions-manager";
import { canWrite as canWriteCached, getMyAccount, getMyBranches } from "@/lib/supabase/request-cache";

export const metadata = { title: "İmalatlar" };

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

export default async function ProductionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const branchId = await getSelectedBranchId((await getMyBranches()).branches);
  const params = await searchParams;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(new Date());
  // Proje detayındaki "İmalat" etiketinden gelince o günün imalatı açılır.
  const initialDate = isDate(params.tarih) ? params.tarih : today;
  const month = initialDate.slice(0, 7);
  const monthStart = `${month}-01`;
  const monthEnd = `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, "0")}`;
  const productionRepository = new ProductionRepository(supabase);
  const [personnel, entries, canWrite, canSeePrices, projects, types, account, chiefIds] = await Promise.all([
    new PersonnelRepository(supabase).list({ activeOnly: true, branchId }),
    productionRepository.listEntries(monthStart, monthEnd, branchId),
    canWriteCached("productions"),
    canWriteCached("hakedis"),
    productionRepository.listProjectOptions(branchId),
    new ProjectRepository(supabase).listTypes(true),
    getMyAccount(),
    productionRepository.listTeamChiefIds(),
  ]);
  const extraPrices = canSeePrices
    ? await productionRepository.getExtraPrices(
        entries.flatMap((entry) => entry.jobs.flatMap((job) => job.items.filter((item) => item.kind === "extra").map((item) => item.id)))
      )
    : {};

  return (
    <ProductionsManager
      initialDate={initialDate}
      personnel={personnel}
      chiefIds={chiefIds}
      initialEntries={entries}
      readOnly={!canWrite}
      projects={projects}
      projectTypes={types}
      canSeePrices={canSeePrices}
      initialExtraPrices={extraPrices}
      currency={account.company?.currency_code ?? "TRY"}
    />
  );
}
