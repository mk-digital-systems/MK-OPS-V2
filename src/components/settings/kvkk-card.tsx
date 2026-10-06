"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { KVKK_DOCUMENTS } from "@/lib/constants/legal";
import { downloadPersonnelNoticeWord, type ControllerInfo } from "@/lib/kvkk-personnel-notice";
import { useReportBrand } from "@/components/layout/company-brand-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STORAGE_KEY = "mkops.kvkk.controller";

function loadSaved(fallbackName: string): ControllerInfo {
  const empty = { name: fallbackName, address: "", email: "", phone: "", kep: "" };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? { ...empty, ...JSON.parse(saved) } : empty;
  } catch {
    return empty;
  }
}

/** Ayarlar → KVKK: müşteri firmanın çalışan aydınlatma metni ve MK OPS KVKK belgeleri */
export function KvkkCard({ companyName }: { companyName: string }) {
  const brand = useReportBrand();
  const [info, setInfo] = useState<ControllerInfo>({ name: companyName, address: "", email: "", phone: "", kep: "" });
  const [busy, setBusy] = useState(false);
  // Kayıtlı bilgiler sayfa açıldıktan sonra okunur (sunucu çıktısıyla uyuşmazlık olmasın).
  useEffect(() => setInfo(loadSaved(companyName)), [companyName]);

  async function download() {
    if (info.name.trim().length < 2) return void toast.error("Firma unvanını yazın");
    if (!info.address.trim()) return void toast.error("Başvuru adresi için firma adresini yazın");
    setBusy(true);
    try {
      // Yalnızca bu tarayıcıda hatırlanır; sunucuya gönderilmez.
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(info)); } catch { /* depolama kapalı olabilir */ }
      await downloadPersonnelNoticeWord(brand, info);
    } catch (error) {
      toast.error("Belge oluşturulamadı", { description: (error as Error)?.message });
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof ControllerInfo, label: string, placeholder = "") => (
    <div className="space-y-1.5">
      <Label htmlFor={`kvkk-${key}`}>{label}</Label>
      <Input id={`kvkk-${key}`} value={info[key]} placeholder={placeholder} onChange={(event) => setInfo({ ...info, [key]: event.target.value })} />
    </div>
  );

  return (
    <Card id="kvkk" className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          KVKK
        </CardTitle>
        <CardDescription>
          Panele girdiğiniz personel verilerinin veri sorumlusu firmanızdır; çalışanlarınızı aydınlatmanız gerekir. Aşağıdaki
          bilgilerle firmanıza özel <strong className="text-foreground">çalışan aydınlatma metnini</strong> Word olarak indirip
          çalışanlarınıza imzalatabilirsiniz. Bilgiler yalnızca bu tarayıcıda hatırlanır.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("name", "Firma unvanı")}
          {field("address", "Adres (başvuru adresi)")}
          {field("email", "E-posta", "kvkk@firmaniz.com")}
          {field("phone", "Telefon")}
          {field("kep", "KEP adresi (varsa)")}
        </div>
        <Button onClick={() => void download()} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Çalışan Aydınlatma Metnini İndir (Word)
        </Button>
        <div className="border-t pt-4">
          <p className="text-sm font-medium">MK OPS ile aranızdaki belgeler</p>
          <ul className="mt-2 space-y-1 text-sm">
            {KVKK_DOCUMENTS.map((doc) => (
              <li key={doc.href}>
                <Link href={doc.href} target="_blank" className="text-primary hover:underline">{doc.title}</Link>
                <span className="text-muted-foreground"> — {doc.summary}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Belgeler genel bilgilendirme amaçlı şablonlardır; firmanıza özgü durumlar için bir hukuk danışmanına
            kontrol ettirmeniz önerilir. Gerekiyorsa VERBİS kaydı firmanızın sorumluluğundadır.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
