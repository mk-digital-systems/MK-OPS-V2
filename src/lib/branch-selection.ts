import { cookies } from "next/headers";
import { BRANCH_COOKIE, type Branch } from "@/types/branch";

/**
 * Menüde seçili şube (sunucu tarafı). Kullanıcının erişebildiği bir şube değilse ya da kullanıcının
 * tek şubesi varsa null (= erişebildiği bütün şubeler; kısıtı veritabanı zaten uygular).
 */
export async function getSelectedBranchId(branches: Branch[]): Promise<string | null> {
  if (branches.length < 2) return null;
  const value = (await cookies()).get(BRANCH_COOKIE)?.value ?? "";
  return branches.some((branch) => branch.id === value) ? value : null;
}
