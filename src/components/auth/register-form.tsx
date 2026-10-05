"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  registerSchema,
  type RegisterFormValues,
} from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/layout/brand-logo";
import { CompanyFields } from "@/components/auth/company-fields";
import { completeOnboarding } from "@/modules/company/complete-onboarding";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      password_confirmation: "",
      signup_mode: "create",
      company_name: "",
      join_code: "",
    },
  });
  const mode = form.watch("signup_mode");

  async function submit(values: RegisterFormValues) {
    setLoading(true);
    const supabase = createClient();
    const company = {
      signup_mode: values.signup_mode,
      company_name: values.company_name,
      join_code: values.signup_mode === "join" ? values.join_code : "",
    };
    // Şirket seçimi, e-posta doğrulamasından sonraki ilk girişte de kullanılır.
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.full_name, ...company },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setLoading(false);
      toast.error("Kayıt oluşturulamadı", { description: error.message });
      return;
    }
    if (!data.session) {
      setLoading(false);
      toast.success("Kayıt oluşturuldu", {
        description:
          "E-posta adresinize gelen bağlantıyla hesabınızı doğrulayın, ardından giriş yapın.",
      });
      router.replace("/login");
      return;
    }

    try {
      const result = await completeOnboarding(supabase, company);
      toast.success(result.message);
      router.replace(result.path);
    } catch (onboardingError) {
      toast.error("Hesap oluşturuldu ancak şirket adımı tamamlanamadı", {
        description: (onboardingError as Error)?.message,
      });
      router.replace("/onboarding");
    } finally {
      setLoading(false);
      router.refresh();
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-3">
        <BrandLogo size={56} priority />
        <div>
          <CardTitle>Kayıt Ol</CardTitle>
          <CardDescription>
            Şirketinizi kurun ya da çalıştığınız şirkete katılın.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
          <CompanyFields
            mode={mode}
            register={form.register}
            setValue={form.setValue}
            errors={form.formState.errors}
          />
          <FormField
            label="Ad Soyad"
            error={form.formState.errors.full_name?.message}
          >
            <Input autoComplete="name" {...form.register("full_name")} />
          </FormField>
          <FormField
            label="E-posta"
            error={form.formState.errors.email?.message}
          >
            <Input
              type="email"
              autoComplete="email"
              {...form.register("email")}
            />
          </FormField>
          <FormField
            label="Şifre"
            error={form.formState.errors.password?.message}
          >
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register("password")}
            />
          </FormField>
          <FormField
            label="Şifre Tekrarı"
            error={form.formState.errors.password_confirmation?.message}
          >
            <Input
              type="password"
              autoComplete="new-password"
              {...form.register("password_confirmation")}
            />
          </FormField>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Kayıt Ol
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Kayıt olarak{" "}
            <Link href="/kullanim-sartlari" className="underline" target="_blank">
              Kullanım Şartları
            </Link>
            &apos;nı kabul etmiş ve{" "}
            <Link href="/gizlilik-politikasi" className="underline" target="_blank">
              Gizlilik Politikası ve KVKK Aydınlatma Metni
            </Link>
            &apos;ni okumuş olursunuz.
          </p>
          <p className="text-center text-sm text-muted-foreground">
            Zaten hesabınız var mı?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Giriş yapın
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
