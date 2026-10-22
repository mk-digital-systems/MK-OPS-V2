import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { ProjectTypesManager } from "@/components/settings/project-types-manager";
import { getCurrentUser } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Proje Türleri",
};

/** Firmanın proje türleri: süper admin kataloğundan kurulur, firma yalnızca görür. */
export default async function ProjectTypesPage() {
  const supabase = await createClient();
  const [profile, types] = await Promise.all([
    getCurrentUser(),
    new ProjectRepository(supabase).listTypes(true),
  ]);
  if (profile?.role !== "site_chief") notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panel/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Projeler
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Proje Türleri</h1>
        <p className="mt-1 text-sm text-muted-foreground">Firmanızın sektörüne göre kurulan proje türleri</p>
      </div>
      <ProjectTypesManager types={types} />
    </div>
  );
}
