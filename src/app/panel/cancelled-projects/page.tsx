import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { parseProjectSearchParams } from "@/lib/search-params";
import { ProjectsTable } from "@/components/projects/projects-table";
import { Skeleton } from "@/components/ui/skeleton";
import { CancelledSheets } from "@/components/projects/cancelled-sheets";

export const metadata = {
  title: "İptal Edilen Projeler",
};

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function CancelledProjectsContent({ searchParams }: Props) {
  const params = await searchParams;
  const filters = parseProjectSearchParams(params, { archiveScope: "cancelled" });

  const supabase = await createClient();
  const repository = new ProjectRepository(supabase);
  const [result, types, locations, cancelledSheets] = await Promise.all([
    repository.list({ ...filters, archiveScope: "cancelled" }),
    repository.listTypes(true),
    repository.getDistinctLocations(),
    repository.listCancelledSheets(),
  ]);

  return (
    <div className="space-y-8">
      <ProjectsTable
        title="İptal Edilen Projeler"
        result={result}
        types={types}
        locations={locations}
        defaultArchiveScope="cancelled"
        allowArchiveScopeFilter={false}
      />
      <CancelledSheets sheets={cancelledSheets} />
    </div>
  );
}

export default function CancelledProjectsPage(props: Props) {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <CancelledProjectsContent {...props} />
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
