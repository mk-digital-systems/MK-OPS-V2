import { z } from "zod";

export const vehicleSchema = z.object({
  plate: z
    .string()
    .trim()
    .min(5, "Plaka en az 5 karakter olmalı")
    .max(20, "Plaka en fazla 20 karakter olabilir"),
  brand: z
    .string()
    .trim()
    .min(2, "Marka zorunlu")
    .max(80, "Marka en fazla 80 karakter olabilir"),
  model: z
    .string()
    .trim()
    .min(1, "Model zorunlu")
    .max(100, "Model en fazla 100 karakter olabilir"),
  current_km: z.coerce
    .number()
    .int("Kilometre tam sayı olmalı")
    .min(0, "Kilometre negatif olamaz")
    .max(10_000_000, "Kilometre değeri çok yüksek"),
  inspection_date: z.string().optional().or(z.literal("")),
  insurance_date: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type VehicleFormValues = z.infer<typeof vehicleSchema>;
