"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import type { CompanySummary } from "@/types/auth";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STATUS_LABELS: Record<CompanySummary["access_status"], string> = {
  trial: "Deneme",
  active: "Aktif",
  expired: "Süresi doldu",
  suspended: "Askıda",
};

export function CompanyInfoCard({ company }: { company: CompanySummary }) {
  async function copyJoinInfo() {
    if (!company.join_code) return;
    try {
      await navigator.clipboard.writeText(
        `Şirket adı: ${company.name}\nKatılım kodu: ${company.join_code}`
      );
      toast.success("Şirket adı ve katılım kodu kopyalandı");
    } catch {
      toast.error("Kopyalanamadı");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Şirket Bilgileri</CardTitle>
        <CardDescription>
          Çalışanlarınız kayıt olurken şirket adını ve katılım kodunu girer; siz
          Kullanıcılar sayfasından onaylarsınız.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <Info label="Şirket adı" value={company.name} />
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Katılım kodu</p>
          <div className="flex items-center gap-2">
            <span className="font-mono text-2xl font-semibold tracking-[0.3em]">
              {company.join_code ?? "—"}
            </span>
            {company.join_code && (
              <Button type="button" variant="outline" size="sm" onClick={copyJoinInfo}>
                <Copy className="h-4 w-4" />
                Kopyala
              </Button>
            )}
          </div>
        </div>
        <Info label="Durum" value={STATUS_LABELS[company.access_status]} />
        {company.plan ? (
          <Info
            label="Plan"
            value={`${company.plan}${company.plan_ends_at ? ` · ${formatDateTime(company.plan_ends_at)} tarihine kadar` : ""}`}
          />
        ) : (
          <Info label="Deneme bitişi" value={formatDateTime(company.trial_ends_at)} />
        )}
        {company.user_limit !== null && (
          <Info label="Kullanıcı limiti" value={String(company.user_limit)} />
        )}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
