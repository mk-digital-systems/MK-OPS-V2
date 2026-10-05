"use client";

import { useRouter } from "next/navigation";
import { Clock3, LogOut, RefreshCw } from "lucide-react";
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

export function PendingApproval() {
  const router = useRouter();

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
          <Clock3 className="mt-3 h-10 w-10 text-amber-500" />
          <CardTitle>Yetki Onayı Bekleniyor</CardTitle>
          <CardDescription>
            Kaydınız tamamlandı. Şantiye şefi hesabınızı onaylayıp görevinizi
            belirledikten sonra sisteme erişebilirsiniz.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Button variant="outline" onClick={() => router.refresh()}>
            <RefreshCw className="h-4 w-4" />
            Durumu Yenile
          </Button>
          <Button variant="ghost" onClick={logout}>
            <LogOut className="h-4 w-4" />
            Çıkış Yap
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
