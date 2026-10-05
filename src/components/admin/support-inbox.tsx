"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPIC_LABELS,
  type AdminSupportRequest,
  type SupportStatus,
} from "@/types/admin";
import { cn, formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { StatusBadge } from "@/components/admin/companies-manager";
import { SupportStatusBadge } from "@/components/support/support-center";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function SupportInbox({ initialRequests }: { initialRequests: AdminSupportRequest[] }) {
  const [showAll, setShowAll] = useState(false);
  const openCount = initialRequests.filter((request) => request.status === "open").length;
  const visible = showAll ? initialRequests : initialRequests.filter((request) => request.status === "open");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Destek Talepleri</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Plan taleplerini yanıtlayın; ödeme alındıktan sonra planı Şirketler sayfasından atayın
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border bg-background p-1">
          {[
            { value: false, label: `Yanıt bekleyen (${openCount})` },
            { value: true, label: `Tümü (${initialRequests.length})` },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => setShowAll(option.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium",
                showAll === option.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {showAll ? "Henüz talep yok." : "Yanıt bekleyen talep yok."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {visible.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ request }: { request: AdminSupportRequest }) {
  const router = useRouter();
  const [reply, setReply] = useState(request.admin_reply ?? "");
  const [saving, setSaving] = useState<SupportStatus | null>(null);

  async function save(status: SupportStatus) {
    if (status === "answered" && !reply.trim()) {
      toast.error("Yanıt yazın");
      return;
    }
    setSaving(status);
    try {
      await new AdminRepository(createClient()).replySupportRequest(request.id, reply, status);
      toast.success(status === "closed" ? "Talep kapatıldı" : "Yanıt kaydedildi");
      router.refresh();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(null);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{request.company_name}</p>
          <StatusBadge status={request.company_access_status} />
          <SupportStatusBadge status={request.status} />
          <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(request.created_at)}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {request.created_by_name || "—"} · {request.created_by_email || "—"}
        </p>
        <div className="rounded-lg bg-muted/50 p-3 text-sm">
          <p className="mb-1 font-medium">
            {SUPPORT_TOPIC_LABELS[request.topic]}
            {request.requested_plan && ` — ${request.requested_plan}`}
          </p>
          <p className="whitespace-pre-wrap">{request.message}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`reply-${request.id}`}>Yanıtınız</Label>
          <Textarea
            id={`reply-${request.id}`}
            rows={3}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Örn. EFT bilgileri, plan aktif edildi bilgisi…"
          />
          {request.replied_at && (
            <p className="text-xs text-muted-foreground">Son yanıt: {formatDateTime(request.replied_at)}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => save("answered")} disabled={saving !== null}>
            {saving === "answered" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Yanıtla
          </Button>
          {request.status !== "closed" ? (
            <Button variant="outline" onClick={() => save("closed")} disabled={saving !== null}>
              {saving === "closed" && <Loader2 className="h-4 w-4 animate-spin" />}
              Kapat
            </Button>
          ) : (
            <Button variant="outline" onClick={() => save("open")} disabled={saving !== null}>
              {saving === "open" && <Loader2 className="h-4 w-4 animate-spin" />}
              Yeniden aç
            </Button>
          )}
          <span className="self-center text-xs text-muted-foreground">
            Durum: {SUPPORT_STATUS_LABELS[request.status]}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
