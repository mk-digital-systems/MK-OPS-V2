import { redirect } from "next/navigation";
import { PendingApproval } from "@/components/auth/pending-approval";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";

export const metadata = {
  title: "Yetki Onayı Bekleniyor",
};

export default async function PendingApprovalPage() {
  const supabase = await createClient();
  const profile = await new UserRepository(supabase).getCurrent();
  if (!profile) redirect("/login");
  if (profile.is_approved && profile.role !== "pending") {
    redirect(profile.role === "accounting" ? "/attendance" : "/");
  }
  return <PendingApproval />;
}
