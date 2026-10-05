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
    },
  });

  async function submit(values: RegisterFormValues) {
    setLoading(true);
    const { data, error } = await createClient().auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { full_name: values.full_name },
      },
    });
    setLoading(false);

    if (error) {
      toast.error("Kayıt oluşturulamadı", { description: error.message });
      return;
    }
    if (!data.session) {
      toast.success("Kayıt oluşturuldu", {
        description: "E-posta adresinizi doğruladıktan sonra giriş yapın.",
      });
      router.replace("/login");
      return;
    }

    router.replace("/pending-approval");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-3">
        <BrandLogo size={56} priority />
        <div>
          <CardTitle>Kullanıcı Kaydı</CardTitle>
          <CardDescription>
            Kayıt sonrası göreviniz şantiye şefi tarafından onaylanacaktır.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
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
