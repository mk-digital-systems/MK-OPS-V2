import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
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
  const filters = parseProjectSearchParams(params, { archiveScope: "archived" });

  const supabase = await createClient();
  const repository = new ProjectRepository(supabase);
  const [result, types, locations] = await Promise.all([
    repository.list({ ...filters, archiveScope: "archived" }),
    repository.listTypes(true),
    repository.getDistinctLocations(),
  ]);

  return (
    <ProjectsTable
      title="Arşiv"
      result={result}
      types={types}
      locations={locations}
      defaultArchiveScope="archived"
      allowArchiveScopeFilter={false}
    />
  );
}

export default function ArchivePage(props: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ArchiveContent {...props} />
    </Suspense>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
