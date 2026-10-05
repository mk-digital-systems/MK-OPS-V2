"use client";

import { useRouter } from "next/navigation";
import { Ban, Hourglass, LogOut, Mail, RefreshCw } from "lucide-react";
import type { CompanySummary } from "@/types/auth";
import { SUPPORT_EMAIL } from "@/lib/constants/brand";
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

export function SubscriptionNotice({ company }: { company: CompanySummary }) {
  const router = useRouter();
  const suspended = company.access_status === "suspended";
  const planEnded = !suspended && company.plan !== null;

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <BrandLogo size={64} priority />
          {suspended ? (
            <Ban className="mt-3 h-10 w-10 text-destructive" />
          ) : (
            <Hourglass className="mt-3 h-10 w-10 text-amber-500" />
          )}
          <CardTitle>
            {suspended
              ? "Hesap Askıya Alındı"
              : planEnded
                ? "Plan Süreniz Doldu"
                : "Deneme Süreniz Doldu"}
          </CardTitle>
          <CardDescription>
            <strong>{company.name}</strong>{" "}
            {suspended
              ? "hesabı askıya alınmıştır. Ayrıntılar için bizimle iletişime geçin."
              : "hesabının verileri korunuyor. Plan atandığında panele kaldığınız yerden devam edersiniz."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full">
            <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`${company.name} — plan talebi`)}`}>
              <Mail className="h-4 w-4" />
              {SUPPORT_EMAIL}
            </a>
          </Button>
          <div className="grid gap-3 sm:grid-cols-2">
            <Button variant="outline" onClick={() => router.refresh()}>
              <RefreshCw className="h-4 w-4" />
              Durumu Yenile
            </Button>
            <Button variant="ghost" onClick={logout}>
              <LogOut className="h-4 w-4" />
              Çıkış Yap
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
