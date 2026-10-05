import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { SettingsRepository } from "@/modules/settings/settings-repository";
import { parseProjectSearchParams } from "@/lib/search-params";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Arama",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function SearchContent({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseProjectSearchParams(params, {
    archiveScope: "all",
  });

  const supabase = await createClient();
  const projectRepo = new ProjectRepository(supabase);
  const settingsRepo = new SettingsRepository(supabase);

  const [result, typeOptions, locations] = await Promise.all([
    projectRepo.list({ ...filters, archiveScope: filters.archiveScope ?? "all" }),
    settingsRepo.getAllProjectTypeOptions(),
    projectRepo.getDistinctLocations(["KURUMSAL_TTVPN", "ERISIM_ZORUNLULUK"]),
  ]);

  const typeLabels = Object.fromEntries(
    typeOptions.map((t) => [t.key, t.label])
  );

  return (
    <ProjectsTable
      title="Arama"
      result={result}
      typeOptions={typeOptions}
      locations={locations}
      typeLabels={typeLabels}
      showCreate={false}
      defaultArchiveScope="all"
      allowArchiveScopeFilter
    />
  );
}

export default function SearchPage(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      }
    >
      <SearchContent {...props} />
    </Suspense>
  );
}
