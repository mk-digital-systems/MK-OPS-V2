import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { UserRoleManager } from "@/components/users/user-role-manager";

export const metadata = {
  title: "Kullanıcı Yetkileri",
};

export default async function UsersPage() {
  const supabase = await createClient();
  const repository = new UserRepository(supabase);
  const current = await repository.getCurrent();
  if (current?.role !== "site_chief") notFound();

  const [users, permissions] = await Promise.all([
    repository.list(),
    repository.listCompanyManagerPermissions(),
  ]);
  return (
    <UserRoleManager
      initialUsers={users}
      initialPermissions={permissions}
    />
  );
}
