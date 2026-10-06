"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CompanyVaultRepository } from "@/modules/notes/company-vault-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CompanyVaultCard({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 6) return void toast.error("Şifre en az 6 karakter olmalı");
    if (password !== confirm) return void toast.error("Şifreler aynı değil");
    setSaving(true);
    try {
      await new CompanyVaultRepository(createClient()).setPassword(password);
      toast.success(configured ? "Gizli alan şifresi değiştirildi; açık oturumlar kapatıldı" : "Gizli alan şifresi belirlendi");
      setPassword("");
      setConfirm("");
      router.refresh();
    } catch (error) {
      toast.error("Şifre kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card id="gizli-alan" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-amber-600" />
          Gizli Alan Şifresi
        </CardTitle>
        <CardDescription>
          Paneldeki &quot;Önemli ve Gizli Notlar&quot; firmanın ortak alanıdır ve bu şifreyle açılır. Şifreyi yalnızca
          bilmesini istediğiniz kişilerle paylaşın. Şifre değişince açık olan bütün oturumlar kapanır.{" "}
          <strong className="text-foreground">{configured ? "Şifre belirlenmiş." : "Henüz şifre belirlenmemiş."}</strong>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="vault-new-password">{configured ? "Yeni şifre" : "Şifre"}</Label>
            <Input id="vault-new-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} maxLength={72} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="vault-confirm-password">Şifre (tekrar)</Label>
            <Input id="vault-confirm-password" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} maxLength={72} />
          </div>
          <Button disabled={saving || !password || !confirm}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {configured ? "Şifreyi Değiştir" : "Şifreyi Belirle"}
          </Button>
        </form>
        <p className="mt-3 text-xs text-muted-foreground">
          En az 6 karakter. Şifre sunucuda geri çevrilemez biçimde saklanır; unutulursa yenisini belirleyebilirsiniz, notlar
          silinmez.
        </p>
      </CardContent>
    </Card>
  );
}
