export type HakedisReportRow = {
  id: string;
  log_date: string;
  project_id: string;
  project_code: string;
  project_name: string;
  section_name: string | null;
  stage_name: string;
  unit: string | null;
  quantity: number;
  unit_price: number | null;
  amount: number | null;
  team_leader_name: string | null;
  notes: string | null;
};

export type HakedisReport = {
  start: string;
  end: string;
  total_amount: number;
  priced_count: number;
  unpriced_count: number;
  by_project: Array<{
    project_id: string;
    project_code: string;
    project_name: string;
    type_name: string;
    amount: number;
    unpriced: number;
  }>;
  by_stage: Array<{
    type_name: string;
    stage_id: string;
    stage_name: string;
    unit: string | null;
    quantity: number;
    amount: number;
    unpriced: number;
  }>;
  by_leader: Array<{ team_leader_name: string; amount: number; log_count: number }>;
  rows: HakedisReportRow[];
};

export type HakedisSummary = {
  currency_code: "TRY" | "USD" | "EUR";
  period_start: string;
  period_end: string;
  today: number;
  week: number;
  period: number;
  unpriced_in_period: number;
};

/** Proje detayında fiyat bilgisi (yalnızca hakediş yetkisi olanlara). */
export type ProjectPricing = {
  stagePrices: Record<string, number>;
  projectPrices: Record<string, number>;
  logValues: Record<string, { unit_price: number; amount: number }>;
};
