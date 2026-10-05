import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { SettingsRepository } from "@/modules/settings/settings-repository";
import { ProjectForm } from "@/components/projects/project-form";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata = {
  title: "Projeyi Düzenle",
};

export default async function EditProjectPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const projectRepo = new ProjectRepository(supabase);
  const settingsRepo = new SettingsRepository(supabase);

  const [project, typeOptions, personnel] = await Promise.all([
    projectRepo.getById(id),
    settingsRepo.getAllProjectTypeOptions(),
    new PersonnelRepository(supabase).list({ activeOnly: true }),
  ]);

  if (!project) notFound();

  if (project.is_archived || project.is_cancelled) {
    return (
      <div className="rounded-2xl border bg-card p-8 text-sm text-muted-foreground">
        {project.is_cancelled ? "İptal edilen projeler düzenlenemez." : "Arşivdeki projeler düzenlenemez. Önce tekrar aktif edin."}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Projeyi Düzenle
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {project.project_code} · {project.name}
        </p>
      </div>
      <ProjectForm mode="edit" project={project} typeOptions={typeOptions} personnel={personnel} />
    </div>
  );
}
