import { z } from "zod";

export const personnelSchema = z
  .object({
    full_name: z
      .string()
      .trim()
      .min(2, "Ad soyad en az 2 karakter olmalı")
      .max(120),
    job_title: z.string().trim().max(120).optional().or(z.literal("")),
    phone: z
      .string()
      .trim()
      .max(30)
      .optional()
      .or(z.literal("")),
    tc_identity_number: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || /^\d{11}$/.test(value),
        "TC Kimlik No tam olarak 11 rakam olmalı"
      ),
    employment_start_date: z.string().optional().or(z.literal("")),
    employment_end_date: z.string().optional().or(z.literal("")),
    monthly_salary: z.coerce.number().min(0, "Maaş negatif olamaz"),
    is_active: z.boolean(),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.is_active && data.employment_end_date) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employment_end_date"],
        message: "Aktif personelde işten ayrılış tarihi kullanılamaz",
      });
    }
    if (
      data.employment_start_date &&
      data.employment_end_date &&
      data.employment_end_date < data.employment_start_date
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["employment_end_date"],
        message: "Ayrılış tarihi işe giriş tarihinden önce olamaz",
      });
    }
  });

export type PersonnelFormValues = z.infer<typeof personnelSchema>;

export const workPlanMemberSchema = z.object({
  personnel_id: z.string().nullable(),
  full_name: z.string().min(2),
  job_title: z.string().nullable(),
  phone: z.string().nullable(),
  is_chief: z.boolean(),
  sort_order: z.number().int().min(0),
});

export const workPlanTeamSchema = z
  .object({
    client_id: z.string(),
    project_code: z.string().trim().max(80),
    project_name: z.string().trim().min(2, "Proje adı zorunlu").max(200),
    team_type: z.string().trim().min(1, "Ekip türü zorunlu").max(80),
    vehicle_plate: z.string().trim().min(1, "Araç plakası zorunlu").max(40),
    chief_personnel_id: z.string().min(1, "Ekip şefi seçilmeli"),
    chief_name: z.string().trim().min(2, "Ekip şefi adı zorunlu"),
    chief_phone: z
      .string()
      .trim()
      .min(7, "Ekip şefi telefonu zorunlu")
      .max(30),
    member_ids: z.array(z.string()),
    members: z.array(workPlanMemberSchema),
  })
  .superRefine((team, ctx) => {
    if (!team.chief_personnel_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Ekip şefi zorunlu",
        path: ["chief_personnel_id"],
      });
    }
    const chiefs = team.members.filter((m) => m.is_chief);
    if (chiefs.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Listede tek bir ekip şefi olmalıdır",
        path: ["members"],
      });
    }
    if (team.members.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "En az ekip şefi eklenmelidir",
        path: ["members"],
      });
    }
  });

export const workPlanFormSchema = z.object({
  plan_date: z.string().min(1, "Plan tarihi zorunlu"),
  notes: z.string().optional().or(z.literal("")),
  teams: z
    .array(workPlanTeamSchema)
    .min(1, "En az bir ekip eklenmelidir"),
});

export type WorkPlanFormValues = z.infer<typeof workPlanFormSchema>;
export type WorkPlanTeamFormValues = z.infer<typeof workPlanTeamSchema>;
