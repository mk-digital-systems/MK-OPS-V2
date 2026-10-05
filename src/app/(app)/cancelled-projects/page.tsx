import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { SettingsRepository } from "@/modules/settings/settings-repository";
import { parseProjectSearchParams } from "@/lib/search-params";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = { title: "İptal Edilen Projeler" };
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function CancelledProjectsContent({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseProjectSearchParams(params, { archiveScope: "cancelled" });
  const supabase = await createClient();
  const projectRepo = new ProjectRepository(supabase);
  const settingsRepo = new SettingsRepository(supabase);
  const [result, typeOptions, locations] = await Promise.all([
    projectRepo.list({ ...filters, archiveScope: "cancelled" }),
    settingsRepo.getAllProjectTypeOptions(),
    projectRepo.getDistinctLocations(["KURUMSAL_TTVPN", "ERISIM_ZORUNLULUK"]),
  ]);
  return <ProjectsTable title="İptal Edilen Projeler" result={result} typeOptions={typeOptions} locations={locations} typeLabels={Object.fromEntries(typeOptions.map((type) => [type.key, type.label]))} showCreate={false} defaultArchiveScope="cancelled" allowArchiveScopeFilter={false} />;
}

export default function CancelledProjectsPage(props: Props) {
  return <Suspense fallback={<div className="space-y-4"><Skeleton className="h-10 w-64" /><Skeleton className="h-40 w-full" /><Skeleton className="h-96 w-full" /></div>}><CancelledProjectsContent {...props} /></Suspense>;
}
