"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, LogOut } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { isTotpCode, mfaErrorMessage, normalizeTotp } from "@/lib/mfa";
import { safeNextPath } from "@/lib/safe-redirect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Giriş sonrası ikinci adım: doğrulayıcı uygulamadaki 6 haneli kod. */
export function MfaVerifyForm({ next, email }: { next: string | null; email: string | null }) {
  const router = useRouter();
  const target = safeNextPath(next, "/admin");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    createClient()
      .auth.mfa.listFactors()
      .then(({ data }) => {
        if (!alive) return;
        const verified = data?.totp?.[0];
        if (!verified) {
          // Doğrulanmış faktör yoksa ikinci adım gerekmez.
          router.replace(target);
          router.refresh();
          return;
        }
        setFactorId(verified.id);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [router, target]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!factorId || !isTotpCode(code)) {
      toast.error("6 haneli kodu girin");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: normalizeTotp(code) });
    if (error) {
      setBusy(false);
      setCode("");
      toast.error("Doğrulanamadı", { description: mfaErrorMessage(error) });
      return;
    }
    router.replace(target);
    router.refresh();
  }

  async function logout() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <Card className="w-full max-w-md border-border/70 shadow-xl">
      <CardHeader className="space-y-3">
        <KeyRound className="h-10 w-10 text-primary" />
        <div>
          <CardTitle className="text-2xl tracking-tight">İki adımlı doğrulama</CardTitle>
          <CardDescription>
            {email ? `${email} hesabı için ` : ""}doğrulayıcı uygulamanızdaki 6 haneli kodu girin.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!ready ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Yükleniyor…
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="mfa-code">Doğrulama kodu</Label>
              <Input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={7}
                placeholder="123456"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="text-center text-lg tracking-widest"
              />
            </div>
            <Button type="submit" className="w-full" disabled={busy || !isTotpCode(code)}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Doğrula
            </Button>
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          Cihazınıza erişemiyorsanız kurtarma prosedürünü uygulayın (docs/dahili/yonetici-mfa-kurtarma.md).
        </p>
        <Button variant="ghost" size="sm" onClick={logout} className="w-full">
          <LogOut className="h-4 w-4" />
          Çıkış yap
        </Button>
      </CardContent>
    </Card>
  );
}
