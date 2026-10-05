import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { NotesRepository } from "@/modules/notes/notes-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { hasAppAccess, resolveAccountHome } from "@/lib/account-routing";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const profile = await new UserRepository(supabase).getCurrent();
  if (!profile) redirect("/login");
  const account = await new CompanyRepository(supabase).getMyAccount();
  if (!hasAppAccess(profile, account)) redirect(resolveAccountHome(profile, account));
  const [avatarUrl, notes, writableModules] = await Promise.all([
    new UserRepository(supabase).createAvatarUrl(profile.avatar_path),
    new NotesRepository(supabase).list(),
    new UserRepository(supabase).getWritableModules(),
  ]);
  const pathname = (await headers()).get("x-app-pathname") || "/panel";
  const permissionModule = pathname.startsWith("/panel/projects") ? "projects"
    : pathname.startsWith("/panel/work-plans") ? "work_plans"
    : pathname.startsWith("/panel/imalatlar") ? "productions"
    : pathname.startsWith("/panel/vehicles") ? "vehicles"
    : pathname.startsWith("/panel/inventory") ? "inventory"
    : pathname.startsWith("/panel/custody") ? "custody" : null;

  if (
    profile.role === "accounting" &&
    !pathname.startsWith("/panel/attendance") &&
    !pathname.startsWith("/panel/personnel") &&
    !pathname.startsWith("/panel/profile") &&
    (!permissionModule || !writableModules.includes(permissionModule))
  ) redirect("/panel/attendance");

  if (
    (pathname.startsWith("/panel/users") || pathname.startsWith("/panel/settings")) &&
    profile.role !== "site_chief"
  ) redirect(profile.role === "accounting" ? "/panel/attendance" : "/panel");

  const isWriteOnlyRoute =
    pathname === "/panel/projects/new" ||
    /^\/panel\/projects\/[^/]+\/edit$/.test(pathname) ||
    pathname === "/panel/work-plans/new" ||
    /^\/panel\/work-plans\/[^/]+\/edit$/.test(pathname);
  if (isWriteOnlyRoute) {
    const requiredModule = pathname.startsWith("/panel/work-plans")
      ? "work_plans"
      : "projects";
    if (!writableModules.includes(requiredModule)) {
      redirect(pathname.startsWith("/panel/work-plans") ? "/panel/work-plans" : "/panel/projects");
    }
  }

  return (
    <AppShell
      profile={profile}
      avatarUrl={avatarUrl}
      notes={notes}
      writableModules={writableModules}
      company={account.company}
    >
      {children}
    </AppShell>
  );
}
