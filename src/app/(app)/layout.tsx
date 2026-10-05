import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { NotesRepository } from "@/modules/notes/notes-repository";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const profile = await new UserRepository(supabase).getCurrent();
  if (!profile) redirect("/login");
  if (!profile.is_approved || profile.role === "pending")
    redirect("/pending-approval");
  const [avatarUrl, notes, writableModules] = await Promise.all([
    new UserRepository(supabase).createAvatarUrl(profile.avatar_path),
    new NotesRepository(supabase).list(),
    new UserRepository(supabase).getWritableModules(),
  ]);
  const pathname = (await headers()).get("x-app-pathname") || "/";
  const permissionModule = pathname.startsWith("/projects") ? "projects"
    : pathname.startsWith("/work-plans") ? "work_plans"
    : pathname.startsWith("/imalatlar") ? "productions"
    : pathname.startsWith("/vehicles") ? "vehicles"
    : pathname.startsWith("/inventory") ? "inventory"
    : pathname.startsWith("/custody") ? "custody" : null;

  if (
    profile.role === "accounting" &&
    !pathname.startsWith("/attendance") &&
    !pathname.startsWith("/personnel") &&
    !pathname.startsWith("/profile") &&
    (!permissionModule || !writableModules.includes(permissionModule))
  ) redirect("/attendance");

  if (
    (pathname.startsWith("/users") || pathname.startsWith("/settings")) &&
    profile.role !== "site_chief"
  ) redirect(profile.role === "accounting" ? "/attendance" : "/");

  const isWriteOnlyRoute =
    pathname === "/projects/new" ||
    /^\/projects\/[^/]+\/edit$/.test(pathname) ||
    pathname === "/work-plans/new" ||
    /^\/work-plans\/[^/]+\/edit$/.test(pathname);
  if (isWriteOnlyRoute) {
    const requiredModule = pathname.startsWith("/work-plans")
      ? "work_plans"
      : "projects";
    if (!writableModules.includes(requiredModule)) {
      redirect(pathname.startsWith("/work-plans") ? "/work-plans" : "/projects");
    }
  }

  return (
    <AppShell
      profile={profile}
      avatarUrl={avatarUrl}
      notes={notes}
      writableModules={writableModules}
    >
      {children}
    </AppShell>
  );
}
