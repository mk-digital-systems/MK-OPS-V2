import { z } from "zod";

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(3, "Ad soyad zorunlu").max(120),
    email: z.string().trim().email("Geçerli bir e-posta girin"),
    password: z.string().min(8, "Şifre en az 8 karakter olmalı").max(100),
    password_confirmation: z.string(),
  })
  .refine((data) => data.password === data.password_confirmation, {
    path: ["password_confirmation"],
    message: "Şifreler eşleşmiyor",
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;

export const profileSchema = z.object({
  full_name: z.string().trim().min(3, "Ad soyad zorunlu").max(120),
  job_title: z.string().trim().max(120, "Görev en fazla 120 karakter olabilir"),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
