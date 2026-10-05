import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { UserRepository } from "@/modules/users/user-repository";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { ProjectDetail } from "@/components/projects/project-detail";

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
    new UserRepository(supabase).canWrite("projects"),
    new PersonnelRepository(supabase).list({ activeOnly: true }),
  ]);
  if (!project) notFound();
  const type = types.find((item) => item.id === project.project_type_id);
  if (!type) notFound();

  return <ProjectDetail project={project} type={type} progress={progress} personnel={personnel} readOnly={!canWrite} />;
}
