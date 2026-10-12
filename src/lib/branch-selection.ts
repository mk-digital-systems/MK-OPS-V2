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

/**
 * Tek şubeye ait işlemler (iş planı, taslak) için şube: menüde seçili şube; seçili değilse ve kullanıcının
 * birden fazla şubesi varsa Merkez ya da ilk şubesi; tek şubesi varsa null (veritabanı zaten onunla sınırlar).
 */
export async function getEffectiveBranchId(branches: Branch[]): Promise<string | null> {
  const selected = await getSelectedBranchId(branches);
  if (selected || branches.length < 2) return selected;
  return (branches.find((branch) => branch.is_main) ?? branches[0]).id;
}
