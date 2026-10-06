"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Loader2, LogOut, RefreshCw, ShieldCheck, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CompanyRepository } from "@/modules/company/company-repository";
import { BrandLogo } from "@/components/layout/brand-logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function PendingApproval({
  companyName,
  isSuperAdmin,
}: {
  companyName: string | null;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  async function cancelRequest() {
    if (!window.confirm(`${companyName} şirketine katılma isteğiniz iptal edilsin mi?`)) return;
    setLeaving(true);
    try {
      await new CompanyRepository(createClient()).leavePendingCompany();
      toast.success("Katılma isteği iptal edildi");
      router.replace("/onboarding");
      router.refresh();
    } catch (error) {
      toast.error("İstek iptal edilemedi", { description: (error as Error)?.message });
    } finally {
      setLeaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <BrandLogo size={64} priority />
          {isSuperAdmin ? (
            <ShieldCheck className="mt-3 h-10 w-10 text-primary" />
          ) : (
            <Clock3 className="mt-3 h-10 w-10 text-amber-500" />
          )}
          <CardTitle>{isSuperAdmin ? "Süper Admin Hesabı" : "Yetki Onayı Bekleniyor"}</CardTitle>
          <CardDescription>
            {isSuperAdmin ? (
              "Süper admin paneli hazırlanıyor. Panel yayına alındığında şirketleri buradan yöneteceksiniz."
            ) : (
              <>
                <strong>{companyName}</strong> şirketine katılma isteğiniz
                alındı. Firma yöneticiniz hesabınızı onaylayıp görevinizi
                belirledikten sonra sisteme erişebilirsiniz.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
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
          {!isSuperAdmin && companyName && (
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={cancelRequest}
              disabled={leaving}
            >
              {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
              İsteği iptal et, başka şirket seç
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
