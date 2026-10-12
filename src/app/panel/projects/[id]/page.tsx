import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { UserRepository } from "@/modules/users/user-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { HakedisRepository } from "@/modules/hakedis/hakedis-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { ProjectDetail } from "@/components/projects/project-detail";
import { PozRepository } from "@/modules/poz/poz-repository";

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

  const userRepository = new UserRepository(supabase);
  const [project, types, progress, canWrite, canSeePrices, personnel, account] = await Promise.all([
    repository.getById(id),
    repository.listTypes(true),
    repository.getProgress(id),
    userRepository.canWrite("projects"),
    userRepository.canWrite("hakedis"),
    new PersonnelRepository(supabase).list({ activeOnly: true }),
    new CompanyRepository(supabase).getMyAccount(),
  ]);
  if (!project) notFound();
  const type = types.find((item) => item.id === project.project_type_id);
  if (!type) notFound();
  const [hpSheets, projectStages, catalogId] = await Promise.all([
    type.screen === "hp" ? repository.getHpSheets(project.id) : Promise.resolve(null),
    repository.getProjectStages(project, type),
    repository.getTypeCatalogId(type),
  ]);
  // Katalogdan kurulan türde iş kalemleri firmanın poz listesinden (o katalog) gelir.
  const pozes = catalogId
    ? ((await new PozRepository(supabase).getList().catch(() => null))?.items ?? []).filter((item) => item.catalog_id === catalogId)
    : null;

  const pricing = canSeePrices
    ? await new HakedisRepository(supabase).getProjectPricing(
        projectStages.map((stage) => stage.id),
        progress.progress.map((row) => row.id),
        progress.logs.map((log) => log.id)
      )
    : null;

  return (
    <ProjectDetail
      project={project}
      type={type}
      projectStages={projectStages}
      progress={progress}
      hpSheets={hpSheets}
      pozes={pozes}
      personnel={personnel}
      readOnly={!canWrite}
      pricing={pricing}
      currency={account.company?.currency_code ?? "TRY"}
    />
  );
}
