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
  /** Firma yöneticisi veya Merkez'e atanmış şantiye şefi: bütün şubeler ve personel/araç onayı. */
  head_office: boolean;
  assignments: { user_id: string; branch_id: string }[] | null;
  /** Merkez yetkisi verilmiş şantiye şefleri (yalnızca firma yöneticisine döner). */
  head_office_users?: string[] | null;
};

/** Seçili şubenin tutulduğu çerez ("" = tüm şubeler). */
export const BRANCH_COOKIE = "mk_branch";
