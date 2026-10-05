import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const pathname = (await headers()).get("x-app-pathname") || "";
  if (pathname !== "/update-password") {
    const supabase = await createClient();
    const profile = await new UserRepository(supabase).getCurrent();
    if (profile?.is_approved && profile.role !== "pending") {
      redirect(profile.role === "accounting" ? "/attendance" : "/");
    }
    if (profile) redirect("/pending-approval");
  }

  return children;
}
