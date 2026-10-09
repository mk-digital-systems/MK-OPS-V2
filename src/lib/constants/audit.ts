import type { AuditAction, AuditModule } from "@/types/audit";
import { USER_ROLE_LABELS, type UserRole } from "@/types/auth";
import { PROJECT_STATUSES, STAGE_STATUSES } from "@/lib/constants/project";
import { INVENTORY_UNITS } from "@/lib/constants/inventory";

export const AUDIT_MODULES: { value: AuditModule; label: string }[] = [
  { value: "projects", label: "Projeler" },
  { value: "hakedis", label: "Hakediş" },
  { value: "work_plans", label: "İş Planı" },
  { value: "productions", label: "İmalatlar" },
  { value: "personnel", label: "Personel" },
  { value: "vehicles", label: "Araçlar" },
  { value: "inventory", label: "Malzeme Stoku" },
  { value: "users", label: "Kullanıcılar ve Yetkiler" },
  { value: "settings", label: "Firma Ayarları" },
];

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  insert: "Ekledi",
  update: "Güncelledi",
  delete: "Sildi",
};

export const AUDIT_ENTITY_LABELS: Record<string, string> = {
  projects: "Proje",
  project_types: "Proje türü",
  project_sections: "Bölüm",
  project_stage_progress: "Aşama",
  project_stage_logs: "İş kaydı",
  hakedis_stage_prices: "Varsayılan birim fiyat",
  hakedis_project_prices: "Projeye özel birim fiyat",
  personnel: "Personel",
  personnel_advances: "Avans",
  vehicles: "Araç",
  inventory_catalog: "Malzeme tanımı",
  inventory_materials: "Malzeme",
  daily_work_plans: "İş planı",
  production_entries: "İmalat kaydı",
  profiles: "Kullanıcı",
  company_manager_permissions: "Modül yetkileri",
  companies: "Firma",
  inventory_categories: "Malzeme kategorisi",
  inventory_locations: "Depo",
  company_vault_notes: "Gizli not",
  company_vaults: "Gizli alan",
  subcontractors: "Taşeron",
  subcontractor_transactions: "Taşeron harcama/ödeme",
  teams: "Ekip",
};

const FIELD_LABELS: Record<string, string> = {
  // Proje
  project_code: "Proje kodu",
  name: "Ad",
  location: "Konum",
  team_name: "Ekip",
  description: "Açıklama",
  status: "Durum",
  received_at: "Alınma tarihi",
  start_date: "Başlangıç",
  estimated_end_date: "Tahmini bitiş",
  completed_at: "Tamamlanma",
  progress_notes: "İlerleme notu",
  is_archived: "Arşivde",
  project_date: "Proje tarihi",
  completed_by_name: "Tamamlayan",
  current_team_leader_name: "Ekip şefi",
  is_cancelled: "İptal",
  cancellation_reason: "İptal nedeni",
  hold_reason: "Bekletme nedeni",
  image_url: "Görsel",
  project_type_id: "Proje türü",
  has_sections: "Bölümlü",
  section_label: "Bölüm adı",
  color: "Renk",
  sort_order: "Sıra",
  coordinates: "Koordinat",
  target_quantity: "Hedef miktar",
  log_date: "Tarih",
  quantity: "Miktar",
  team_leader_name: "Ekip şefi",
  unit_price: "Birim fiyat",
  // Personel
  full_name: "Ad soyad",
  phone: "Telefon",
  is_active: "Aktif",
  notes: "Not",
  employment_start_date: "İşe giriş",
  employment_end_date: "İşten çıkış",
  tc_identity_number: "TC kimlik no",
  job_title: "Görev",
  monthly_salary: "Aylık maaş",
  termination_reason: "Çıkış nedeni",
  advance_date: "Avans tarihi",
  amount: "Tutar",
  // Araç
  plate: "Plaka",
  brand: "Marka",
  model: "Model",
  current_km: "Kilometre",
  inspection_date: "Muayene tarihi",
  insurance_date: "Sigorta tarihi",
  assigned_personnel_id: "Zimmetli personel",
  // Stok
  material_name: "Malzeme",
  material_code: "Malzeme ID",
  category_id: "Kategori",
  is_main: "Ana depo",
  material_category: "Malzeme sınıfı",
  material_type: "Tür",
  size: "Ebat",
  unit: "Birim",
  has_id: "ID'li",
  // İş planı / imalat
  plan_date: "Plan tarihi",
  work_date: "İş tarihi",
  team_leader_name_snapshot: "Ekip başı",
  // Kullanıcı ve yetkiler
  email: "E-posta",
  role: "Rol",
  is_approved: "Onaylı",
  approval_status: "Onay durumu",
  share_percent: "Taşeron payı (%)",
  subcontractor_id: "Taşeron",
  leader_personnel_id: "Ekip başı",
  sgk_paid_by_main: "SGK ana firmadan",
  transaction_date: "Tarih",
  contact_name: "Yetkili",
  tax_number: "Vergi no",
  iban: "IBAN",
  projects_write: "Yetki: Projeler",
  work_plans_write: "Yetki: İş planı",
  personnel_write: "Yetki: Personel",
  attendance_write: "Yetki: Puantaj",
  vehicles_write: "Yetki: Araçlar",
  inventory_write: "Yetki: Malzeme stoku",
  custody_write: "Yetki: Araç ekipmanları",
  productions_write: "Yetki: İmalatlar",
  hakedis_write: "Yetki: Hakediş",
  // Firma
  join_code: "Katılım kodu",
  plan: "Plan",
  plan_ends_at: "Plan bitişi",
  trial_ends_at: "Deneme bitişi",
  user_limit: "Kullanıcı limiti",
  suspended_at: "Askıya alınma",
  payroll_start_day: "Hakediş dönem başlangıç günü",
  currency_code: "Para birimi",
  logo_path: "Logo",
};

export function auditFieldLabel(field: string) {
  return FIELD_LABELS[field] ?? field.replace(/_/g, " ");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Kimlik (uuid) alanları kullanıcıya anlamsız; ayrıntıda gösterilmez veya "değişti" yazılır. */
export function isReferenceField(field: string) {
  return field.endsWith("_id") || field === "user_id";
}

function formatDay(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

export function formatAuditValue(field: string, value: unknown, entityType: string): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Evet" : "Hayır";
  if (typeof value === "number") return value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
  if (typeof value !== "string") return JSON.stringify(value);

  if (field === "status") {
    const statuses: readonly { value: string; label: string }[] =
      entityType === "projects" ? PROJECT_STATUSES : STAGE_STATUSES;
    return statuses.find((item) => item.value === value)?.label ?? value;
  }
  if (field === "approval_status") return value === "pending" ? "Onay bekliyor" : value === "approved" ? "Onaylandı" : value;
  if (field === "role") return USER_ROLE_LABELS[value as UserRole] ?? (value === "super_admin" ? "MK OPS Destek" : value);
  if (field === "unit" && entityType.startsWith("inventory")) return INVENTORY_UNITS.find((item) => item.value === value)?.label ?? value;
  if (field === "logo_path" || field === "image_url") return "Dosya";
  if (UUID.test(value)) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDay(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul",
    }).format(new Date(value));
  }
  return value;
}
