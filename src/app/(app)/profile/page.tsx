import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { ProfileForm } from "@/components/users/profile-form";

export const metadata = {
  title: "Profilim",
};

export default async function ProfilePage() {
  const supabase = await createClient();
  const repository = new UserRepository(supabase);
  const profile = await repository.getCurrent();
  if (!profile) redirect("/login");
  const avatarUrl = await repository.createAvatarUrl(profile.avatar_path);

  return <ProfileForm initialProfile={profile} initialAvatarUrl={avatarUrl} />;
}
