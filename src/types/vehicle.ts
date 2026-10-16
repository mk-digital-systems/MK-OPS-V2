import type { RecordApprovalStatus } from "@/types/work-plan";

export type Vehicle = {
  id: string;
  plate: string;
  brand: string;
  model: string;
  current_km: number;
  notes: string | null;
  inspection_date: string | null;
  insurance_date: string | null;
  /** Aylık araç kirası; taşeron personeline atalıysa atalı gün oranıyla taşeronun hesabına yazılır. */
  monthly_rent: number;
  assigned_personnel_id: string | null;
  branch_id: string;
  /** Şube şefi/muhasebenin eklediği araç firma yöneticisi veya Merkez şefi onaylayana kadar "pending". */
  approval_status: RecordApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export type VehicleInput = {
  plate: string;
  brand: string;
  model: string;
  current_km: number;
  notes?: string | null;
  inspection_date?: string | null;
  insurance_date?: string | null;
  monthly_rent?: number;
  branch_id?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
};

export type VehicleUpdate = Partial<VehicleInput>;

export type VehicleDeadlineAlert = {
  vehicle_id: string;
  plate: string;
  brand: string;
  model: string;
  deadline_type: "inspection" | "insurance";
  deadline_date: string;
  days_remaining: number;
};

export type VehicleFuelLog = {
  id: string;
  vehicle_id: string;
  fuel_date: string;
  odometer_km: number;
  liters: number;
  /** Litre fiyatı; araç taşerondaysa litre × fiyat taşeronun hesabına yazılır. */
  unit_price: number | null;
  notes: string | null;
  /** Yakıtın yazıldığı şube (varsayılan: aracın o tarihteki şubesi). */
  branch_id: string;
  created_by: string | null;
  created_at: string;
};
