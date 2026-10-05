import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { SettingsRepository } from "@/modules/settings/settings-repository";
import { parseProjectSearchParams } from "@/lib/search-params";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata = {
  title: "Arşiv",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function ArchiveContent({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseProjectSearchParams(params, {
    archiveScope: "archived",
  });

  const supabase = await createClient();
  const projectRepo = new ProjectRepository(supabase);
  const settingsRepo = new SettingsRepository(supabase);

  const [result, typeOptions, locations] = await Promise.all([
    projectRepo.list({ ...filters, archiveScope: "archived" }),
    settingsRepo.getAllProjectTypeOptions(),
    projectRepo.getDistinctLocations(["KURUMSAL_TTVPN", "ERISIM_ZORUNLULUK"]),
  ]);

  const typeLabels = Object.fromEntries(
    typeOptions.map((t) => [t.key, t.label])
  );

  return (
    <ProjectsTable
      title="Arşiv"
      result={result}
      typeOptions={typeOptions}
      locations={locations}
      typeLabels={typeLabels}
      showCreate={false}
      defaultArchiveScope="archived"
      allowArchiveScopeFilter={false}
    />
  );
}

export default function ArchivePage(props: Props) {
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
      <ArchiveContent {...props} />
    </Suspense>
  );
}
