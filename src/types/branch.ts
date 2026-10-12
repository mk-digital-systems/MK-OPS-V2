export type Branch = {
  id: string;
  name: string;
  /** Merkez şubesi: her firmada bir tane, silinemez. */
  is_main: boolean;
  sort_order: number;
};

/** Kullanıcının erişebildiği şubeler; firma yöneticisine kullanıcı atamaları da döner. */
export type MyBranches = {
  branches: Branch[];
  /** Firmadaki toplam şube sayısı (tek şubeli firmada şube arayüzü gösterilmez). */
  total_count: number;
  assignments: { user_id: string; branch_id: string }[] | null;
};

/** Seçili şubenin tutulduğu çerez ("" = tüm şubeler). */
export const BRANCH_COOKIE = "mk_branch";
