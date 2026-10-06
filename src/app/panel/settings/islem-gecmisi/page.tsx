import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserRepository } from "@/modules/users/user-repository";
import { AuditRepository } from "@/modules/audit/audit-repository";
import { AUDIT_MODULES } from "@/lib/constants/audit";
import { AuditLogView } from "@/components/audit/audit-log-view";
import type { AuditFilters, AuditModule } from "@/types/audit";

export const metadata = {
  title: "İşlem Geçmişi",
};

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

function istanbulToday(offsetDays = 0) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(date);
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const [profile, params] = await Promise.all([new UserRepository(supabase).getCurrent(), searchParams]);
  if (profile?.role !== "site_chief") notFound();

  const from = isDate(params.from) ? params.from : istanbulToday(-6);
  const to = isDate(params.to) && params.to >= from ? params.to : istanbulToday();
  const filters: AuditFilters = {
    from,
    to,
    module: AUDIT_MODULES.some((item) => item.value === params.module) ? (params.module as AuditModule) : null,
    actor: typeof params.actor === "string" && /^[0-9a-f-]{36}$/i.test(params.actor) ? params.actor : null,
    page: Math.max(0, Math.min(200, Number(params.page) || 0)),
  };

  const repository = new AuditRepository(supabase);
  const [{ logs, hasMore }, actors] = await Promise.all([repository.list(filters), repository.listActors()]);

  return <AuditLogView logs={logs} hasMore={hasMore} actors={actors} filters={filters} />;
}
