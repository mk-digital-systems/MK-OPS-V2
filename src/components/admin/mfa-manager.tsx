"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { isTotpCode, mfaErrorMessage, normalizeTotp } from "@/lib/mfa";
import { formatDateTime } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Factor = { id: string; friendly_name?: string; created_at: string };
type Enrollment = { factorId: string; qr: string; secret: string };

export function MfaManager() {
  const router = useRouter();
  const confirm = useConfirm();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await createClient().auth.mfa.listFactors();
    if (error) {
      toast.error("Doğrulayıcılar yüklenemedi", { description: mfaErrorMessage(error) });
      setFactors([]);
      return;
    }
    setFactors((data?.totp ?? []) as Factor[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function startEnroll() {
    setBusy(true);
    const supabase = createClient();
    // Yarım kalmış (doğrulanmamış) kayıtlar yeni eklemeyi engelleyebilir: önce temizle.
    const { data: all } = await supabase.auth.mfa.listFactors();
    for (const factor of all?.all ?? []) {
      if (factor.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Doğrulayıcı ${new Date().toLocaleDateString("tr-TR")} ${Math.random().toString(36).slice(2, 6)}`,
    });
    setBusy(false);
    if (error || !data) {
      toast.error("Doğrulayıcı eklenemedi", { description: mfaErrorMessage(error) });
      return;
    }
    setCode("");
    setEnrollment({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verifyEnroll() {
    if (!enrollment || !isTotpCode(code)) return;
    setBusy(true);
    const { error } = await createClient().auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code: normalizeTotp(code),
    });
    setBusy(false);
    if (error) {
      setCode("");
      toast.error("Doğrulanamadı", { description: mfaErrorMessage(error) });
      return;
    }
    toast.success("Doğrulayıcı eklendi. İki adımlı doğrulama artık zorunlu.");
    setEnrollment(null);
    setCode("");
    await load();
    router.refresh();
  }

  async function cancelEnroll() {
    if (enrollment) await createClient().auth.mfa.unenroll({ factorId: enrollment.factorId });
    setEnrollment(null);
    setCode("");
  }

  async function remove(factor: Factor) {
    const last = (factors?.length ?? 0) <= 1;
    const ok = await confirm(
      last
        ? "Bu son doğrulayıcı. Kaldırırsanız iki adımlı doğrulama KAPANIR ve hesap yalnızca şifreyle korunur. Kaldırılsın mı?"
        : "Bu doğrulayıcı kaldırılsın mı? Başka bir doğrulayıcınız kalacak."
    );
    if (!ok) return;
    setBusy(true);
    const { error } = await createClient().auth.mfa.unenroll({ factorId: factor.id });
    setBusy(false);
    if (error) {
      toast.error("Kaldırılamadı", { description: mfaErrorMessage(error) });
      return;
    }
    toast.success("Doğrulayıcı kaldırıldı");
    await load();
    router.refresh();
  }

  const enabled = (factors?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Güvenlik</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Süper admin hesabı tüm firmaların verisine ve plan/ödeme işlemlerine erişir. İki adımlı doğrulama açıkken şifre tek
          başına yetmez: giriş sonrası doğrulayıcı uygulamadaki 6 haneli kod da gerekir. Kural veritabanında uygulanır; şifre
          ele geçirilse bile API üzerinden yönetici işlemi yapılamaz.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-3">
            {factors === null ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : enabled ? (
              <>
                <ShieldCheck className="h-6 w-6 text-emerald-600" />
                <div>
                  <p className="font-semibold">İki adımlı doğrulama AÇIK</p>
                  <p className="text-xs text-muted-foreground">{factors.length} doğrulayıcı kayıtlı</p>
                </div>
                {factors.length < 2 && (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                    Yedek için ikinci bir doğrulayıcı ekleyin
                  </Badge>
                )}
              </>
            ) : (
              <>
                <ShieldAlert className="h-6 w-6 text-amber-600" />
                <div>
                  <p className="font-semibold">İki adımlı doğrulama KAPALI</p>
                  <p className="text-xs text-muted-foreground">Hesap yalnızca şifreyle korunuyor. Açmanız önerilir.</p>
                </div>
              </>
            )}
          </div>

          {factors && factors.length > 0 && (
            <ul className="divide-y rounded-lg border text-sm">
              {factors.map((factor) => (
                <li key={factor.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{factor.friendly_name || "Doğrulayıcı"}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{formatDateTime(factor.created_at)}</span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => remove(factor)} disabled={busy}>
                    <Trash2 className="h-4 w-4" />
                    Kaldır
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {!enrollment ? (
            <Button onClick={startEnroll} disabled={busy || factors === null}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {enabled ? "Yeni doğrulayıcı ekle" : "İki adımlı doğrulamayı aç"}
            </Button>
          ) : (
            <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
              <p className="text-sm font-medium">
                1. Telefonunuzda bir doğrulayıcı uygulaması açın (Google Authenticator, Microsoft Authenticator, Authy…)
                ve bu QR kodu okutun.
              </p>
              {/* QR, Supabase'in döndürdüğü veri adresi (data:image/svg+xml); next/image gerekmez. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrollment.qr} alt="Doğrulayıcı QR kodu" className="h-44 w-44 rounded-lg border bg-white p-2" />
              <p className="text-xs text-muted-foreground">
                QR okutamıyorsanız anahtarı elle girin:{" "}
                <code className="select-all break-all rounded bg-muted px-1.5 py-0.5">{enrollment.secret}</code>
              </p>
              <div className="space-y-2">
                <Label htmlFor="enroll-code">2. Uygulamadaki 6 haneli kodu girin</Label>
                <Input
                  id="enroll-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  placeholder="123456"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  className="max-w-48 text-center text-lg tracking-widest"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={verifyEnroll} disabled={busy || !isTotpCode(code)}>
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Doğrula ve aç
                </Button>
                <Button variant="ghost" onClick={cancelEnroll} disabled={busy}>
                  Vazgeç
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-5 text-sm">
          <h2 className="font-semibold">Telefonu kaybederseniz</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong>Önlem:</strong> iki ayrı cihaza (ör. telefon + yedek telefon/tablet) doğrulayıcı ekleyin. Biri kaybolursa
              diğeriyle girip kaybolanı buradan kaldırırsınız.
            </li>
            <li>
              <strong>Hiçbirine erişemiyorsanız:</strong> Supabase SQL Editor&apos;de{" "}
              <code className="rounded bg-muted px-1 py-0.5">delete from auth.mfa_factors where user_id = &apos;…&apos;;</code>{" "}
              ile faktör silinir; hesap şifreyle girer, sonra yeniden eklersiniz. Adımlar:{" "}
              <code className="rounded bg-muted px-1 py-0.5">docs/dahili/yonetici-mfa-kurtarma.md</code>.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
