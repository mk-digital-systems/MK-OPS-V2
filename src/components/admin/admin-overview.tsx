"use client";

import Link from "next/link";
import { AlertTriangle, CalendarClock, LifeBuoy, MoonStar, UserCheck, UserPlus } from "lucide-react";
import type { AdminCompany, AdminCompanyHealth } from "@/types/admin";
import { cn, formatDate } from "@/lib/utils";

const DAY = 86_400_000;

/** Erişimin biteceği an: planı varsa plan bitişi (yoksa süresiz), yoksa deneme bitişi. */
export function accessEndsAt(company: AdminCompany): string | null {
  if (company.access_status === "suspended") return null;
  return company.plan ? company.plan_ends_at : company.trial_ends_at;
}

export function daysLeft(iso: string, now = Date.now()): number {
  return Math.ceil((new Date(iso).getTime() - now) / DAY);
}

/** Kayıt olmuş ama sistemi kurmamış firma: 3 günden eski, hiç proje/personel/araç yok. */
export function isIdleCompany(company: AdminCompany, health: AdminCompanyHealth | undefined, now = Date.now()): boolean {
  if (!health || company.access_status === "suspended") return false;
  const emptyData = health.project_count + health.personnel_count + health.vehicle_count === 0;
  return emptyData && now - new Date(company.created_at).getTime() > 3 * DAY;
}

export function AdminOverview({
  companies,
  health,
  onPick,
}: {
  companies: AdminCompany[];
  health: Map<string, AdminCompanyHealth>;
  onPick: (company: AdminCompany) => void;
}) {
  const now = Date.now();
  const expiring = companies
    .map((company) => ({ company, end: accessEndsAt(company) }))
    .filter((row): row is { company: AdminCompany; end: string } => {
      if (!row.end || row.company.access_status === "expired") return false;
      const left = daysLeft(row.end, now);
      return left >= 0 && left <= 7;
    })
    .sort((a, b) => new Date(a.end).getTime() - new Date(b.end).getTime());
  const recentlyExpired = companies.filter(
    (company) => company.access_status === "expired" && now - new Date(accessEndsAt(company) ?? 0).getTime() < 14 * DAY
  );
  const pendingUsers = companies.filter((company) => company.pending_users > 0);
  const idle = companies.filter((company) => isIdleCompany(company, health.get(company.id), now));
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const newThisMonth = companies.filter((company) => new Date(company.created_at).getTime() >= monthStart).length;
  const openRequests = companies.reduce((sum, company) => sum + company.open_requests, 0);
  const todo = expiring.length + recentlyExpired.length + pendingUsers.length + idle.length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Bugün bakılacaklar</h2>
        <p className="text-xs text-muted-foreground">
          {newThisMonth} yeni kayıt bu ay · {openRequests} açık destek talebi
        </p>
      </div>

      {todo === 0 && openRequests === 0 ? (
        <div className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          Şu an takip gerektiren bir durum yok.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel
            icon={CalendarClock}
            title="Süresi dolmak üzere (7 gün)"
            tone="amber"
            empty="Önümüzdeki 7 günde bitecek erişim yok."
            rows={expiring.map(({ company, end }) => ({
              key: company.id,
              company,
              text: `${company.plan ?? "Deneme"} · ${formatDate(end)} (${daysLeft(end, now) === 0 ? "bugün" : `${daysLeft(end, now)} gün`})`,
            }))}
            onPick={onPick}
          />
          <Panel
            icon={AlertTriangle}
            title="Yeni süresi dolanlar (14 gün)"
            tone="red"
            empty="Son 14 günde süresi dolan firma yok."
            rows={recentlyExpired.map((company) => ({
              key: company.id,
              company,
              text: `${company.plan ?? "Deneme"} · ${formatDate(accessEndsAt(company))} bitti`,
            }))}
            onPick={onPick}
          />
          <Panel
            icon={UserCheck}
            title="Onay bekleyen kullanıcılar"
            tone="sky"
            empty="Onay bekleyen kullanıcı yok."
            rows={pendingUsers.map((company) => ({
              key: company.id,
              company,
              text: `${company.pending_users} kişi bekliyor`,
            }))}
            onPick={onPick}
          />
          <Panel
            icon={MoonStar}
            title="Kurulum yapmayan firmalar"
            tone="slate"
            empty="Kayıtlı ama boş kalan firma yok."
            hint="3 günden eski, hiç proje, personel veya araç eklememiş. Aranmaya değer."
            rows={idle.map((company) => ({
              key: company.id,
              company,
              text: `Kayıt ${formatDate(company.created_at)} · ${company.owner_email ?? "—"}`,
            }))}
            onPick={onPick}
          />
        </div>
      )}

      {openRequests > 0 && (
        <Link
          href="/admin/support"
          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <LifeBuoy className="h-4 w-4" />
          {openRequests} açık destek talebi yanıt bekliyor
        </Link>
      )}
    </section>
  );
}

const TONES = {
  amber: "text-amber-600",
  red: "text-red-600",
  sky: "text-sky-600",
  slate: "text-slate-500",
} as const;

function Panel({
  icon: Icon,
  title,
  tone,
  empty,
  hint,
  rows,
  onPick,
}: {
  icon: typeof UserPlus;
  title: string;
  tone: keyof typeof TONES;
  empty: string;
  hint?: string;
  rows: { key: string; company: AdminCompany; text: string }[];
  onPick: (company: AdminCompany) => void;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", TONES[tone])} />
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{rows.length}</span>
      </div>
      {hint && rows.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y text-sm">
          {rows.slice(0, 6).map((row) => (
            <li key={row.key}>
              <button
                type="button"
                onClick={() => onPick(row.company)}
                className="flex w-full items-center justify-between gap-3 py-1.5 text-left hover:text-primary"
              >
                <span className="truncate font-medium">{row.company.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{row.text}</span>
              </button>
            </li>
          ))}
          {rows.length > 6 && <li className="pt-1.5 text-xs text-muted-foreground">+{rows.length - 6} firma daha</li>}
        </ul>
      )}
    </div>
  );
}
