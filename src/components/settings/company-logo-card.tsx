"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageUp, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { CompanySummary } from "@/types/auth";
import { COMPANY_LOGO_MAX_BYTES, COMPANY_LOGO_TYPES, companyLogoUrl } from "@/lib/report-brand";
import { createClient } from "@/lib/supabase/client";
import { CompanyRepository } from "@/modules/company/company-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function CompanyLogoCard({ company }: { company: CompanySummary }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "remove" | null>(null);
  const logoUrl = companyLogoUrl(company.logo_path);

  async function upload(file: File) {
    if (!COMPANY_LOGO_TYPES.includes(file.type)) {
      toast.error("Logo PNG, JPG veya WEBP olmalı");
      return;
    }
    if (file.size > COMPANY_LOGO_MAX_BYTES) {
      toast.error("Logo en fazla 2 MB olabilir");
      return;
    }
    setBusy("upload");
    try {
      await new CompanyRepository(createClient()).uploadLogo(company.id, file, company.logo_path);
      toast.success("Logo kaydedildi");
      router.refresh();
    } catch (error) {
      toast.error("Logo yüklenemedi", { description: (error as Error)?.message });
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    if (!window.confirm("Firma logosu kaldırılsın mı? Raporlarda yalnızca firma adı yazılır.")) return;
    setBusy("remove");
    try {
      await new CompanyRepository(createClient()).removeLogo(company.logo_path);
      toast.success("Logo kaldırıldı");
      router.refresh();
    } catch (error) {
      toast.error("Logo kaldırılamadı", { description: (error as Error)?.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Firma Logosu</CardTitle>
        <CardDescription>
          PDF, Word, Excel çıktılarında ve iş planı görselinde firma adınızla birlikte görünür. Logo yoksa yalnızca
          firma adı yazılır.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-4">
        <div className="flex h-24 w-48 items-center justify-center rounded-xl border bg-white p-2">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={company.name} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-sm font-semibold text-slate-700">{company.name}</span>
          )}
        </div>
        <div className="space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={COMPANY_LOGO_TYPES.join(",")}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => inputRef.current?.click()} disabled={busy !== null}>
              {busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageUp className="h-4 w-4" />}
              {logoUrl ? "Logoyu değiştir" : "Logo yükle"}
            </Button>
            {logoUrl && (
              <Button variant="outline" onClick={remove} disabled={busy !== null}>
                {busy === "remove" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Kaldır
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">PNG, JPG veya WEBP · en fazla 2 MB · yatay ve şeffaf arka planlı logo önerilir</p>
        </div>
      </CardContent>
    </Card>
  );
}
