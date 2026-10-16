import type { Branch } from "@/types/branch";

export type BranchSection<T> = { id: string; name: string | null; items: T[] };

/** Şube sırası: önce Merkez, sonra şubelerin oluşturulma sırası. */
export function orderBranches(branches: Branch[]): Branch[] {
  return [...branches].sort(
    (a, b) => Number(b.is_main) - Number(a.is_main) || a.sort_order - b.sort_order || a.name.localeCompare(b.name, "tr")
  );
}

/**
 * Kayıtları şubelere ayırır (önce Merkez, sonra diğer şubeler; kayıtların kendi sırası korunur).
 * Firmada tek şube varsa ya da kayıtlar tek şubedense başlıksız tek bölüm döner (name = null).
 */
export function groupByBranch<T>(
  items: T[],
  branchIdOf: (item: T) => string | null | undefined,
  branches: Branch[],
  multiBranch: boolean
): BranchSection<T>[] {
  const present = new Set(items.map((item) => branchIdOf(item) ?? ""));
  if (!multiBranch || present.size < 2) return [{ id: "all", name: null, items }];
  const known = orderBranches(branches).filter((branch) => present.has(branch.id));
  const sections: BranchSection<T>[] = known.map((branch) => ({
    id: branch.id,
    name: branch.name,
    items: items.filter((item) => branchIdOf(item) === branch.id),
  }));
  const rest = items.filter((item) => !known.some((branch) => branch.id === branchIdOf(item)));
  return rest.length ? [...sections, { id: "other", name: "Diğer", items: rest }] : sections;
}
