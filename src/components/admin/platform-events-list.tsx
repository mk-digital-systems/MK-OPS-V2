"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import {
  PLATFORM_EVENT_LABELS,
  PLATFORM_FIELD_LABELS,
  type PlatformEvent,
  type PlatformEventAction,
} from "@/types/admin";
import { cn, formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ACTION_CLASSES: Record<PlatformEventAction, string> = {
  update_company: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
  suspend_company: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
  unsuspend_company: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  delete_company: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
};

const DATE_FIELDS = new Set(["plan_ends_at", "trial_ends_at"]);

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return field.endsWith("_limit") ? "Sınırsız" : "—";
  if (DATE_FIELDS.has(field)) return formatDateTime(String(value));
  return String(value);
}

function Details({ event }: { event: PlatformEvent }) {
  if (event.action === "update_company") {
    const rows = Object.entries(event.details) as [string, { old: unknown; new: unknown }][];
    return (
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {rows.map(([field, change]) => (
          <li key={field}>
            <span className="font-medium text-foreground">{PLATFORM_FIELD_LABELS[field] ?? field}:</span>{" "}
            {formatValue(field, change.old)} → {formatValue(field, change.new)}
          </li>
        ))}
      </ul>
    );
  }
  if (event.action === "delete_company") {
    const d = event.details as { owner_email?: string | null; plan?: string | null; user_count?: number };
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Yönetici: {d.owner_email ?? "—"} · Plan: {d.plan ?? "Deneme"} · {d.user_count ?? 0} kullanıcı
      </p>
    );
  }
  return null;
}

export function PlatformEventsList({ events, filtered }: { events: PlatformEvent[]; filtered: boolean }) {
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<PlatformEventAction | "all">("all");

  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    return events.filter((event) => {
      if (action !== "all" && event.action !== action) return false;
      if (!needle) return true;
      return [event.company_name, event.actor_email].some((v) => v?.toLocaleLowerCase("tr-TR").includes(needle));
    });
  }, [events, query, action]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">İşlem Geçmişi</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Süper admin olarak firmalarda yapılan plan, süre, limit, askıya alma ve silme işlemleri. Silinen firmaların
          kaydı da burada kalır.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Firma veya işlemi yapan e-posta"
            className="pl-9"
          />
        </div>
        {(["all", ...Object.keys(PLATFORM_EVENT_LABELS)] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setAction(key as PlatformEventAction | "all")}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent",
              action === key && "border-primary bg-primary text-primary-foreground hover:bg-primary"
            )}
          >
            {key === "all" ? "Tümü" : PLATFORM_EVENT_LABELS[key as PlatformEventAction]}
          </button>
        ))}
        {filtered && (
          <Link href="/admin/gecmis" className="text-xs font-medium text-primary underline">
            Tüm firmaları göster
          </Link>
        )}
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {events.length === 0 ? "Henüz kayıtlı işlem yok." : "Filtreye uyan işlem yok."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2">
          {rows.map((event) => (
            <Card key={event.id}>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={ACTION_CLASSES[event.action]}>{PLATFORM_EVENT_LABELS[event.action]}</Badge>
                  <p className="font-semibold">{event.company_name}</p>
                  <p className="ml-auto text-xs text-muted-foreground">
                    {formatDateTime(event.created_at)} · {event.actor_email ?? "—"}
                  </p>
                </div>
                <Details event={event} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
