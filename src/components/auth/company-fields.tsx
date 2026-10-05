"use client";

import type { FieldErrors, UseFormRegister, UseFormSetValue } from "react-hook-form";
import { Building2, UserPlus } from "lucide-react";
import type { SignupMode } from "@/types/auth";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CompanyFieldValues = {
  signup_mode: SignupMode;
  company_name: string;
  join_code: string;
};

const MODES: { value: SignupMode; label: string; hint: string; icon: typeof Building2 }[] = [
  {
    value: "create",
    label: "Yeni şirket kur",
    hint: "Şirketinizin ana yöneticisi olursunuz; 48 saat ücretsiz deneme başlar.",
    icon: Building2,
  },
  {
    value: "join",
    label: "Şirkete katıl",
    hint: "Şantiye şefinizden aldığınız 4 haneli kodu girin; şef onaylayınca erişirsiniz.",
    icon: UserPlus,
  },
];

export function CompanyFields<T extends CompanyFieldValues>({
  mode,
  register,
  setValue,
  errors,
}: {
  mode: SignupMode;
  register: UseFormRegister<T>;
  setValue: UseFormSetValue<T>;
  errors: FieldErrors<T>;
}) {
  // Ortak alanlar her iki formda da aynı adla bulunur.
  const reg = register as unknown as UseFormRegister<CompanyFieldValues>;
  const set = setValue as unknown as UseFormSetValue<CompanyFieldValues>;
  const err = errors as FieldErrors<CompanyFieldValues>;
  const active = MODES.find((item) => item.value === mode) ?? MODES[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Şirket seçimi">
        {MODES.map((item) => (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={mode === item.value}
            onClick={() => set("signup_mode", item.value, { shouldValidate: false })}
            className={cn(
              "flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              mode === item.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-accent"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{active.hint}</p>

      <div className="space-y-2">
        <Label htmlFor="company_name">Şirket Adı</Label>
        <Input id="company_name" autoComplete="organization" {...reg("company_name")} />
        {err.company_name?.message && (
          <p className="text-xs text-destructive">{err.company_name.message}</p>
        )}
      </div>

      {mode === "join" && (
        <div className="space-y-2">
          <Label htmlFor="join_code">Katılım Kodu</Label>
          <Input
            id="join_code"
            inputMode="numeric"
            maxLength={4}
            placeholder="0000"
            autoComplete="off"
            {...reg("join_code")}
          />
          {err.join_code?.message && (
            <p className="text-xs text-destructive">{err.join_code.message}</p>
          )}
        </div>
      )}
    </div>
  );
}
