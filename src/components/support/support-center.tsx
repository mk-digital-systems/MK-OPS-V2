"use client";

import { useState } from "react";
import { Loader2, MessageSquareReply, Send } from "lucide-react";
import { toast } from "sonner";
import {
  SUPPORT_STATUS_LABELS,
  SUPPORT_TOPIC_LABELS,
  type SupportRequest,
  type SupportStatus,
  type SupportTopic,
} from "@/types/admin";
import { PLAN_PRESETS } from "@/lib/constants/plans";
import { cn, formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { SupportRepository } from "@/modules/support/support-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const STATUS_CLASSES: Record<SupportStatus, string> = {
  open: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  answered: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  closed: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  return <Badge className={STATUS_CLASSES[status]}>{SUPPORT_STATUS_LABELS[status]}</Badge>;
}

export function SupportCenter({
  initialRequests,
  defaultTopic = "support",
  compact = false,
}: {
  initialRequests: SupportRequest[];
  defaultTopic?: SupportTopic;
  /** Abonelik ekranında başlık ve açıklama gösterilmez. */
  compact?: boolean;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [topic, setTopic] = useState<SupportTopic>(defaultTopic);
  const [requestedPlan, setRequestedPlan] = useState<string>(PLAN_PRESETS[0]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (message.trim().length < 3) {
      toast.error("Mesajınızı yazın");
      return;
    }
    setSending(true);
    try {
      const created = await new SupportRepository(createClient()).create({
        topic,
        requestedPlan: topic === "plan" ? requestedPlan : null,
        message,
      });
      setRequests((current) => [created, ...current]);
      setMessage("");
      toast.success("Talebiniz iletildi", { description: "Yanıtımızı bu sayfadan takip edebilirsiniz." });
    } catch (error) {
      toast.error("Talep gönderilemedi", { description: (error as Error)?.message });
    } finally {
      setSending(false);
    }
  }

  const form = (
    <form onSubmit={submit} className="space-y-4 text-left">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Talep türü">
        {(["plan", "support"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={topic === value}
            onClick={() => setTopic(value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              topic === value ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            {SUPPORT_TOPIC_LABELS[value]}
          </button>
        ))}
      </div>
      {topic === "plan" && (
        <div className="space-y-2">
          <Label htmlFor="requested-plan">İstenen plan</Label>
          <Input
            id="requested-plan"
            list="support-plan-presets"
            value={requestedPlan}
            onChange={(event) => setRequestedPlan(event.target.value)}
          />
          <datalist id="support-plan-presets">
            {PLAN_PRESETS.map((preset) => (
              <option key={preset} value={preset} />
            ))}
          </datalist>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="support-message">Mesajınız</Label>
        <Textarea
          id="support-message"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={
            topic === "plan"
              ? "Kullanıcı sayınızı ve ödeme dönemini (aylık/yıllık) yazın. EFT bilgilerini size ileteceğiz."
              : "Yaşadığınız sorunu veya sorunuzu yazın."
          }
        />
      </div>
      <Button type="submit" className="w-full sm:w-auto" disabled={sending}>
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Talebi Gönder
      </Button>
    </form>
  );

  const list = requests.length > 0 && (
    <div className="space-y-3 text-left">
      <h2 className="text-sm font-semibold">Talepleriniz</h2>
      {requests.map((request) => (
        <div key={request.id} className="space-y-2 rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {SUPPORT_TOPIC_LABELS[request.topic]}
              {request.requested_plan && ` — ${request.requested_plan}`}
            </span>
            <SupportStatusBadge status={request.status} />
            <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(request.created_at)}</span>
          </div>
          <p className="whitespace-pre-wrap text-muted-foreground">{request.message}</p>
          {request.admin_reply && (
            <div className="flex gap-2 rounded-md bg-primary/5 p-2">
              <MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <p className="whitespace-pre-wrap">{request.admin_reply}</p>
                {request.replied_at && (
                  <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(request.replied_at)}</p>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-6">
        {form}
        {list}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Destek</h1>
        <p className="mt-1 text-sm text-muted-foreground">Plan talebi gönderin veya destek isteyin</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Yeni talep</CardTitle>
          <CardDescription>
            Plan ödemeleri EFT ile alınır. Talebinizi gönderin; ödeme bilgilerini yanıt olarak iletelim, ödeme
            sonrası planınız aktif edilsin.
          </CardDescription>
        </CardHeader>
        <CardContent>{form}</CardContent>
      </Card>
      {list}
    </div>
  );
}
