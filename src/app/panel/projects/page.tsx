import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { parseProjectSearchParams } from "@/lib/search-params";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Skeleton } from "@/components/ui/skeleton";
import { UserRepository } from "@/modules/users/user-repository";

export const metadata = {
  title: "Projeler",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function ProjectsContent({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseProjectSearchParams(params, { archiveScope: "active" });
  if (filters.search?.trim() && !params.scope) filters.archiveScope = "all";

  const supabase = await createClient();
  const repository = new ProjectRepository(supabase);
  const [result, exportResult, types, locations, canWrite] = await Promise.all([
    repository.list(filters),
    repository.list({ ...filters, page: 1, pageSize: 5000 }),
    repository.listTypes(true),
    repository.getDistinctLocations(),
    new UserRepository(supabase).canWrite("projects"),
  ]);

  return (
    <ProjectsTable
      title="Projeler"
      result={result}
      types={types}
      locations={locations}
      showCreate={canWrite}
      exportProjects={exportResult.data}
      defaultArchiveScope="active"
      allowArchiveScopeFilter
    />
  );
}

export default function ProjectsPage(props: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ProjectsContent {...props} />
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
