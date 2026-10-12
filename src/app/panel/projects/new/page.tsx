import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { ProjectForm } from "@/components/projects/project-form";

export const metadata = {
  title: "Yeni Proje",
};

export default async function NewProjectPage() {
  const supabase = await createClient();
  const repository = new ProjectRepository(supabase);
  const [types, locations, addons] = await Promise.all([
    repository.listTypes(),
    repository.getDistinctLocations(),
    new CompanyRepository(supabase).getProjectAddons(),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Yeni Proje</h1>
        <p className="mt-1 text-sm text-muted-foreground">Proje türünü seçin; aşamalar türe göre otomatik oluşturulur.</p>
      </div>
      <ProjectForm mode="create" types={types} locations={locations} addons={addons} />
    </div>
  );
}
