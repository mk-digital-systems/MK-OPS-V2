import { z } from "zod";

const companyFields = {
  signup_mode: z.enum(["create", "join"]),
  company_name: z
    .string()
    .trim()
    .min(2, "Şirket adı en az 2 karakter olmalı")
    .max(120, "Şirket adı en fazla 120 karakter olabilir"),
  join_code: z.string().trim(),
};

function requireJoinCode(
  data: { signup_mode: "create" | "join"; join_code: string },
  ctx: z.RefinementCtx
) {
  if (data.signup_mode === "join" && !/^[0-9]{4}$/.test(data.join_code)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["join_code"],
      message: "Katılım kodu 4 haneli olmalı",
    });
  }
}

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(3, "Ad soyad zorunlu").max(120),
    email: z.string().trim().email("Geçerli bir e-posta girin"),
    password: z.string().min(8, "Şifre en az 8 karakter olmalı").max(100),
    password_confirmation: z.string(),
    ...companyFields,
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.password_confirmation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["password_confirmation"],
        message: "Şifreler eşleşmiyor",
      });
    }
    requireJoinCode(data, ctx);
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const onboardingSchema = z.object(companyFields).superRefine(requireJoinCode);

export type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export const profileSchema = z.object({
  full_name: z.string().trim().min(3, "Ad soyad zorunlu").max(120),
  job_title: z.string().trim().max(120, "Görev en fazla 120 karakter olabilir"),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
