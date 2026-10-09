export type Subcontractor = {
  id: string;
  name: string;
  /** Taşeronun kendisi (personel kaydı); taşeron personel kartından yönetilir. */
  personnel_id: string | null;
  contact_name: string | null;
  phone: string | null;
  tax_number: string | null;
  iban: string | null;
  /** Taşeron payı (%); ör. 70 → 100 ₺'lik işin 70 ₺'si taşeronun. */
  share_percent: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
};

/** Liste satırı: ekip/personel sayısı; hakediş yetkisi varsa güncel bakiye (yoksa null). */
export type SubcontractorListItem = Subcontractor & {
  team_count: number;
  personnel_count: number;
  balance: number | null;
};

export type SubcontractorCategory = {
  id: string;
  name: string;
  sort_order: number;
};

export type SubcontractorTransaction = {
  id: string;
  subcontractor_id: string;
  category_id: string;
  transaction_date: string;
  amount: number;
  notes: string | null;
};

export type SubcontractorWorkRow = {
  item_id: string;
  kind: "stage" | "extra";
  work_date: string;
  project_code: string;
  project_name: string;
  item_name: string;
  unit: string | null;
  quantity: number;
  unit_price: number | null;
  amount: number | null;
  share_percent: number;
  share_amount: number | null;
  team_leader_name: string;
};

export type SubcontractorStatement = {
  subcontractor_id: string;
  start: string;
  end: string;
  employer_total: number;
  share_total: number;
  company_total: number;
  unpriced_count: number;
  /** Firmanın ödediği maaşlar (taşeron ve ekibi, puantaja göre). */
  salary_total: number;
  paid_total: number;
  carried_balance: number;
  balance: number;
  rows: SubcontractorWorkRow[];
  salaries: { personnel_id: string; full_name: string; monthly_salary: number; payable_days: number; amount: number }[];
  transactions: (SubcontractorTransaction & { category_name: string })[];
  by_category: { category_name: string; amount: number }[];
};
