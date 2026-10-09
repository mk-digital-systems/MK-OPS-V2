export type SharedNote = {
  id: string;
  title: string;
  note_date: string;
  created_by: string | null;
  created_at: string;
};

export type PrivateNote = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};

/** Firmanın şifreli ortak gizli alanındaki not */
export type CompanyVaultNote = {
  id: string;
  title: string;
  content: string;
  updated_at: string;
  updated_by_name: string | null;
};

export type CompanyVaultStatus = {
  /** Firma yöneticisi şifre belirlemiş mi */
  configured: boolean;
  /** Onaylı firma kullanıcısı mı */
  can_use: boolean;
  /** Şifreyi belirleyip değiştirebilir mi (firma yöneticisi) */
  can_manage: boolean;
};
