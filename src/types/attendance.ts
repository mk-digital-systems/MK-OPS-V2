export type AttendanceStatus =
  | "worked"
  | "absent"
  | "unexcused_absence"
  | "leave"
  | "medical_report"
  | "weekly_rest";

export type AttendanceRecord = {
  date: string;
  status: AttendanceStatus;
  is_auto_generated: boolean;
  leave_type?: "annual" | "unpaid" | "excuse" | "other" | null;
};

export type AttendanceTotals = Record<AttendanceStatus, number>;

export type MonthlyAttendancePersonnel = {
  id: string;
  full_name: string;
  phone: string | null;
  tc_identity_number: string | null;
  is_active: boolean;
  employment_start_date?: string | null;
  employment_end_date?: string | null;
  employment_periods?: {
    employment_start_date: string | null;
    employment_end_date: string;
  }[];
  records: AttendanceRecord[];
  totals: AttendanceTotals;
};

export type MonthlyAttendanceData = {
  year: number;
  month: number;
  personnel: MonthlyAttendancePersonnel[];
  active_personnel_ids: string[];
};

export type AttendanceChange = {
  personnel_id: string;
  attendance_date: string;
  status: AttendanceStatus | null;
};

export type PersonnelActivityFilter = "active" | "passive" | "all";

export type PersonnelAttendanceSummary = AttendanceTotals & {
  personnel_id: string;
  full_name: string;
  year: number;
  month: number;
};

export type AttendanceMonthArchive = {
  year: number;
  month: number;
  active_personnel: number;
  worked: number;
  absent: number;
  leave: number;
  medical_report: number;
  weekly_rest: number;
  sunday_worked: number;
};

export type PersonnelListSummary = {
  personnel_id: string;
  month_worked: number;
  month_absent: number;
  month_leave: number;
  month_medical_report: number;
  month_weekly_rest: number;
  year_worked: number;
  year_leave: number;
  year_medical_report: number;
};

export type PersonnelYearTotals = AttendanceTotals & {
  sunday_worked: number;
  total: number;
};

export type PersonnelAttendanceDetail = {
  personnel_id: string;
  year: number;
  month: number;
  month_records: AttendanceRecord[];
  month_totals: AttendanceTotals & { sunday_worked: number };
  year_totals: PersonnelYearTotals;
  month_distribution: {
    month_number: number;
    worked: number;
    leave: number;
    medical_report: number;
    total: number;
  }[];
  leave_history: { year: number; days: number }[];
};

export type PayrollRow = {
  personnel_id: string;
  full_name: string;
  monthly_salary: number;
  worked_days: number;
  weekly_rest_days: number;
  payable_days: number;
  absence_days: number;
  report_days: number;
  overtime_days: number;
  advance_total: number;
  absence_deduction: number;
  overtime_payment: number;
  gross_accrued: number;
  net_receivable: number;
};

export type PersonnelAdvance = {
  id: string;
  personnel_id: string;
  advance_date: string;
  amount: number;
  notes: string | null;
  created_at: string;
};
