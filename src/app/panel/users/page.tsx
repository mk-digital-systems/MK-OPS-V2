import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { CompanyRepository } from "@/modules/company/company-repository";
import { UserRoleManager } from "@/components/users/user-role-manager";

export const metadata = {
  title: "Kullanıcılar",
};

export default async function UsersPage() {
  const supabase = await createClient();
  const repository = new UserRepository(supabase);
  const current = await repository.getCurrent();
  if (!current?.is_approved || (current.role !== "site_chief" && current.role !== "company_manager")) notFound();

  const [users, permissions, account] = await Promise.all([
    repository.list(),
    current.role === "site_chief" ? repository.listCompanyManagerPermissions() : Promise.resolve([]),
    new CompanyRepository(supabase).getMyAccount(),
  ]);
  return (
    <UserRoleManager
      initialUsers={users}
      initialPermissions={permissions}
      viewerRole={current.role}
      currentUserId={current.id}
      primaryManagerId={account.company?.primary_manager_id ?? null}
      userLimit={account.company?.user_limit ?? null}
      companyName={account.company?.name ?? ""}
      joinCode={account.company?.join_code ?? null}
    />
  );
}
