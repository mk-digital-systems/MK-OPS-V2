"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { onboardingSchema, type OnboardingFormValues } from "@/lib/validations/auth";
import { createClient } from "@/lib/supabase/client";
import { completeOnboarding } from "@/modules/company/complete-onboarding";
import { BrandLogo } from "@/components/layout/brand-logo";
import { CompanyFields } from "@/components/auth/company-fields";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function OnboardingForm({ initialValues }: { initialValues: OnboardingFormValues }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: initialValues,
  });
  const mode = form.watch("signup_mode");

  async function submit(values: OnboardingFormValues) {
    setLoading(true);
    try {
      const result = await completeOnboarding(createClient(), values);
      toast.success(result.message);
      router.replace(result.path);
      router.refresh();
    } catch (error) {
      toast.error(values.signup_mode === "create" ? "Şirket kurulamadı" : "Şirkete katılınamadı", {
        description: (error as Error)?.message,
      });
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <BrandLogo size={56} priority />
          <div>
            <CardTitle>Şirketinizi Seçin</CardTitle>
            <CardDescription>
              Devam etmek için yeni bir şirket kurun ya da çalıştığınız şirkete katılın.
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
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "create" ? "Şirketi Kur" : "Katılma İsteği Gönder"}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Çıkış Yap
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
