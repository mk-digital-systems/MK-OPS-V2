import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSelectedBranchId } from "@/lib/branch-selection";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { parseProjectSearchParams } from "@/lib/search-params";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Skeleton } from "@/components/ui/skeleton";
import { canWrite, getCurrentUser, getMyBranches } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Projeler",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function ProjectsContent({ searchParams }: Props) {
  const [params, myBranches] = await Promise.all([searchParams, getMyBranches()]);
  const filters = parseProjectSearchParams(params, { archiveScope: "active" });
  if (filters.search?.trim() && !params.scope) filters.archiveScope = "all";

  const supabase = await createClient();
  filters.branchId = await getSelectedBranchId(myBranches.branches);
  const repository = new ProjectRepository(supabase);
  await repository.refreshOverdueStatuses();
  const [result, exportResult, types, locations, canEdit, profile] = await Promise.all([
    repository.list(filters, { refreshStatuses: false }),
    repository.list({ ...filters, page: 1, pageSize: 5000 }, { refreshStatuses: false }),
    repository.listTypes(true),
    repository.getDistinctLocations(),
    canWrite("projects"),
    getCurrentUser(),
  ]);

  return (
    <ProjectsTable
      title="Projeler"
      result={result}
      types={types}
      locations={locations}
      showCreate={canEdit}
      canManageTypes={profile?.role === "site_chief"}
      exportProjects={exportResult.data}
      showHpReport={types.some((type) => type.screen === "hp")}
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
