"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import {
  forgotPasswordSchema,
  type ForgotPasswordFormValues,
} from "@/lib/validations/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    setLoading(true);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${origin}/auth/callback?next=/update-password`,
    });
    setLoading(false);

    if (error) {
      toast.error("Şifre sıfırlama e-postası gönderilemedi");
      return;
    }

    setSent(true);
    toast.success("Sıfırlama bağlantısı gönderildi");
  }

  return (
    <Card className="w-full max-w-md border-border/70 shadow-xl">
      <CardHeader>
        <CardTitle className="text-2xl tracking-tight">Şifre Sıfırla</CardTitle>
        <CardDescription>
          E-posta adresinize sıfırlama bağlantısı göndereceğiz.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              E-posta kutunuzu kontrol edin. Bağlantıya tıklayarak yeni şifrenizi
              belirleyebilirsiniz.
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Girişe dön</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-posta</Label>
              <Input id="email" type="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              Bağlantı Gönder
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/login">Girişe dön</Link>
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
