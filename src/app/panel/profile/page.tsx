import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { ProfileForm } from "@/components/users/profile-form";
import { getCurrentUser } from "@/lib/supabase/request-cache";

export const metadata = {
  title: "Profilim",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const repository = new UserRepository(supabase);
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  const avatarUrl = await repository.createAvatarUrl(profile.avatar_path);

  return <ProfileForm initialProfile={profile} initialAvatarUrl={avatarUrl} />;
}
