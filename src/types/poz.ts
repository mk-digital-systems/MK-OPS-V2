/** Firma poz listesindeki kalem (türe değil kataloğa bağlı). */
export type PozItem = {
  id: string;
  catalog_id: string;
  group_name: string | null;
  poz_code: string | null;
  name: string;
  unit: string | null;
  is_active: boolean;
  sort_order: number;
  /** Projelerde kullanılmış mı (kullanılmış poz silinmez, pasife alınır) */
  used: boolean;
};

/** Yürürlük tarihli birim fiyat. */
export type PozPrice = {
  stage_id: string;
  valid_from: string;
  unit_price: number;
};

export type PozSuggestion = {
  group_name: string | null;
  poz_code: string | null;
  name: string;
  unit: string | null;
};

export type PozCatalog = {
  id: string;
  name: string;
  items: PozSuggestion[];
};

export type PozList = {
  currency_code: "TRY" | "USD" | "EUR";
  can_edit: boolean;
  can_price: boolean;
  catalogs: PozCatalog[];
  items: PozItem[];
  /** Yalnızca fiyat yetkisi olana dolu gelir */
  prices: PozPrice[];
};

export type PozImportRow = {
  group_name: string;
  poz_code: string;
  name: string;
  unit: string;
  unit_price?: string;
};
