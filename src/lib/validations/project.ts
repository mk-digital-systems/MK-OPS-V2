import { z } from "zod";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || "");

export const projectSchema = z
  .object({
    project_code: z.string().trim().min(1, "Proje kodu zorunlu").max(60, "Proje kodu en fazla 60 karakter olabilir"),
    name: z.string().trim().min(2, "Proje adı en az 2 karakter olmalı").max(160),
    project_type_id: z.string().uuid("Proje türü seçin"),
    location: z.string().trim().min(2, "Konum en az 2 karakter olmalı").max(200),
    team_name: z.string().trim().max(120).optional().transform((value) => value || ""),
    description: z.string().trim().max(2000).optional().transform((value) => value || ""),
    image_url: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || "")
      .refine((value) => !value || /^https?:\/\//i.test(value), "Görsel bağlantısı http(s) ile başlamalı"),
    received_at: optionalDate,
    start_date: optionalDate,
    estimated_end_date: optionalDate,
    priority_order: z
      .string()
      .trim()
      .optional()
      .transform((value) => value || "")
      .refine((value) => !value || (/^\d+$/.test(value) && Number(value) > 0), "Öncelik 1 veya daha büyük bir sayı olmalı"),
  })
  .refine(
    (data) => !data.start_date || !data.estimated_end_date || data.start_date <= data.estimated_end_date,
    { path: ["estimated_end_date"], message: "Planlanan bitiş başlangıçtan önce olamaz" }
  );

export type ProjectFormValues = z.input<typeof projectSchema>;
export type ProjectFormOutput = z.output<typeof projectSchema>;

export const projectTypeSchema = z.object({
  name: z.string().trim().min(2, "Tür adı en az 2 karakter olmalı").max(80),
  description: z.string().trim().max(500),
  has_sections: z.boolean(),
  section_label: z.string().trim().min(2, "Bölüm adı en az 2 karakter olmalı").max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).or(z.literal("")),
  stages: z
    .array(
      z.object({
        id: z.string().nullable(),
        name: z.string().trim().min(1, "Aşama adı boş olamaz").max(80),
        unit: z.string().trim().max(12),
      })
    )
    .min(1, "En az bir aşama ekleyin"),
});

export type ProjectTypeFormValues = z.infer<typeof projectTypeSchema>;

export const stageLogSchema = z.object({
  log_date: z.string().min(1, "Tarih zorunlu"),
  quantity: z
    .string()
    .trim()
    .refine((value) => !value || (Number(value.replace(",", ".")) > 0), "Miktar sıfırdan büyük olmalı"),
  team_leader_personnel_id: z.string(),
  notes: z.string().trim().max(1000),
});

export type StageLogFormValues = z.infer<typeof stageLogSchema>;

export const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
  password: z.string().min(6, "Şifre en az 6 karakter olmalı"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Geçerli bir e-posta girin"),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, "Yeni şifre en az 8 karakter olmalı"),
    confirmPassword: z.string().min(8, "Şifre tekrarı gerekli"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Şifreler eşleşmiyor",
    path: ["confirmPassword"],
  });

export type UpdatePasswordFormValues = z.infer<typeof updatePasswordSchema>;
