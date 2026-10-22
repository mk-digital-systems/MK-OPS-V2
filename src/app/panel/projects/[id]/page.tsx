import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { ProjectDetail } from "@/components/projects/project-detail";
import { PozRepository } from "@/modules/poz/poz-repository";
import { canWrite as canWriteCached } from "@/lib/supabase/request-cache";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const project = await new ProjectRepository(supabase).getById(id);
  return { title: project?.name ?? "Proje" };
}

export default async function ProjectDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const repository = new ProjectRepository(supabase);

  const [project, types, progress, canWrite, personnel] = await Promise.all([
    repository.getById(id),
    repository.listTypes(true),
    repository.getProgress(id),
    canWriteCached("projects"),
    new PersonnelRepository(supabase).list({ activeOnly: true }),
  ]);
  if (!project) notFound();
  const type = types.find((item) => item.id === project.project_type_id);
  if (!type) notFound();
  const [hpSheets, sheetKesif, catalogId] = await Promise.all([
    type.screen === "hp" ? repository.getHpSheets(project.id) : Promise.resolve(null),
    type.screen === "hp" ? repository.getSheetKesif(project.id) : Promise.resolve([]),
    repository.getTypeCatalogId(type),
  ]);
  // Katalogdan kurulan türde iş kalemleri firmanın poz listesinden (o katalog) gelir.
  const pozes = catalogId
    ? ((await new PozRepository(supabase).getList().catch(() => null))?.items ?? []).filter((item) => item.catalog_id === catalogId)
    : null;

  return (
    <ProjectDetail
      project={project}
      type={type}
      progress={progress}
      hpSheets={hpSheets}
      sheetKesif={sheetKesif}
      pozes={pozes}
      personnel={personnel}
      readOnly={!canWrite}
    />
  );
}
