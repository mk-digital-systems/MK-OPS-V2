"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ChevronRight, History, Loader2 } from "lucide-react";
import type { AuditActor, AuditFilters, AuditLog } from "@/types/audit";
import {
  AUDIT_ACTION_LABELS,
  AUDIT_ENTITY_LABELS,
  AUDIT_MODULES,
  auditFieldLabel,
  formatAuditValue,
  isReferenceField,
} from "@/lib/constants/audit";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Props = {
  logs: AuditLog[];
  hasMore: boolean;
  actors: AuditActor[];
  filters: AuditFilters;
};

const ACTION_STYLES: Record<AuditLog["action"], string> = {
  insert: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  update: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  delete: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const timeFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Istanbul",
});

export function AuditLogView({ logs, hasMore, actors, filters }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);

  function go(next: Partial<AuditFilters>) {
    const merged = { ...filters, from, to, page: 0, ...next };
    const params = new URLSearchParams({ from: merged.from, to: merged.to });
    if (merged.module) params.set("module", merged.module);
    if (merged.actor) params.set("actor", merged.actor);
    if (merged.page) params.set("page", String(merged.page));
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/panel/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Ayarlar
        </Link>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <History className="h-7 w-7 text-primary" />
          İşlem Geçmişi
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Kim, ne zaman, hangi kayıtta neyi değiştirdi. Kayıtlar değiştirilemez ve silinemez; yalnızca firma yöneticileri görür.
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Başlangıç</p>
            <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Bitiş</p>
            <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-40" />
          </div>
          <Button variant="outline" onClick={() => from && to && go({})} disabled={pending}>
            Göster
          </Button>
          <div className="min-w-44 flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">Modül</p>
            <NativeSelect
              value={filters.module ?? ""}
              onChange={(event) => go({ module: (event.target.value || null) as AuditFilters["module"] })}
            >
              <option value="">Tümü</option>
              {AUDIT_MODULES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="min-w-44 flex-1 space-y-1">
            <p className="text-xs text-muted-foreground">Kullanıcı</p>
            <NativeSelect value={filters.actor ?? ""} onChange={(event) => go({ actor: event.target.value || null })}>
              <option value="">Tümü</option>
              {actors.map((actor) => (
                <option key={actor.id} value={actor.id}>
                  {actor.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          {pending && <Loader2 className="mb-2.5 h-4 w-4 animate-spin text-muted-foreground" />}
        </CardContent>
      </Card>

      <Card className={cn(pending && "opacity-60")}>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">Seçilen aralıkta işlem kaydı yok.</p>
          ) : (
            <ul className="divide-y">
              {logs.map((log) => (
                <AuditRow key={log.id} log={log} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {(filters.page > 0 || hasMore) && (
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => go({ page: filters.page - 1 })} disabled={filters.page === 0 || pending}>
            Daha yeni
          </Button>
          <span className="text-sm text-muted-foreground">Sayfa {filters.page + 1}</span>
          <Button variant="outline" onClick={() => go({ page: filters.page + 1 })} disabled={!hasMore || pending}>
            Daha eski
          </Button>
        </div>
      )}
    </div>
  );
}

function AuditRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  const fields = Object.entries(log.changes ?? {}).filter(
    ([field]) => log.action === "update" || !isReferenceField(field)
  );
  const moduleLabel = AUDIT_MODULES.find((item) => item.value === log.module)?.label ?? log.module;
  const summary =
    log.action === "update" && fields.length
      ? fields.map(([field]) => auditFieldLabel(field)).join(", ")
      : null;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/40"
      >
        {fields.length > 0 ? (
          open ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium">{log.actor_name ?? "—"}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", ACTION_STYLES[log.action])}>
              {AUDIT_ACTION_LABELS[log.action]}
            </span>
            <span className="text-muted-foreground">{AUDIT_ENTITY_LABELS[log.entity_type] ?? log.entity_type}:</span>
            <span className="min-w-0 break-words font-medium">{log.entity_label || "—"}</span>
          </div>
          {summary && <p className="text-xs text-muted-foreground">Değişen: {summary}</p>}
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground">
          <p>{timeFormat.format(new Date(log.created_at))}</p>
          <p>{moduleLabel}</p>
        </div>
      </button>
      {open && fields.length > 0 && (
        <div className="overflow-x-auto px-4 pb-3 pl-11">
          <table className="w-full max-w-3xl text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-4 font-medium">Alan</th>
                {log.action === "update" ? (
                  <>
                    <th className="py-1 pr-4 font-medium">Önce</th>
                    <th className="py-1 font-medium">Sonra</th>
                  </>
                ) : (
                  <th className="py-1 font-medium">Değer</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y">
              {fields.map(([field, value]) => {
                const change = value as { old?: unknown; new?: unknown };
                return (
                  <tr key={field}>
                    <td className="py-1.5 pr-4 font-medium">{auditFieldLabel(field)}</td>
                    {log.action === "update" ? (
                      isReferenceField(field) ? (
                        <td colSpan={2} className="py-1.5 text-muted-foreground">değişti</td>
                      ) : (
                        <>
                          <td className="py-1.5 pr-4 text-muted-foreground line-through decoration-muted-foreground/40">
                            {formatAuditValue(field, change.old, log.entity_type)}
                          </td>
                          <td className="py-1.5">{formatAuditValue(field, change.new, log.entity_type)}</td>
                        </>
                      )
                    ) : (
                      <td className="py-1.5">{formatAuditValue(field, value, log.entity_type)}</td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </li>
  );
}
