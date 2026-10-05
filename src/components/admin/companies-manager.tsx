"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Loader2, Play, Search, Settings2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import type { AdminCompany, AdminCompanyUser } from "@/types/admin";
import { USER_ROLE_LABELS, type CompanyAccessStatus } from "@/types/auth";
import { ACCESS_STATUS_CLASSES, ACCESS_STATUS_LABELS, PLAN_PRESETS } from "@/lib/constants/plans";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { AdminRepository } from "@/modules/admin/admin-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

const pad = (value: number) => String(value).padStart(2, "0");
const toDateInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const toDateTimeInput = (iso: string) => {
  const date = new Date(iso);
  return `${toDateInput(iso)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const laterOf = (iso: string | null) => Math.max(Date.now(), iso ? new Date(iso).getTime() : 0);

export function StatusBadge({ status }: { status: CompanyAccessStatus }) {
  return <Badge className={ACCESS_STATUS_CLASSES[status]}>{ACCESS_STATUS_LABELS[status]}</Badge>;
}

export function CompaniesManager({ initialCompanies }: { initialCompanies: AdminCompany[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CompanyAccessStatus | "all">("all");
  const [selected, setSelected] = useState<AdminCompany | null>(null);

  const counts = useMemo(() => {
    const result = { all: initialCompanies.length, trial: 0, active: 0, expired: 0, suspended: 0 };
    for (const company of initialCompanies) result[company.access_status] += 1;
    return result;
  }, [initialCompanies]);
  const openRequests = initialCompanies.reduce((sum, company) => sum + company.open_requests, 0);

  const filtered = initialCompanies.filter((company) => {
    if (statusFilter !== "all" && company.access_status !== statusFilter) return false;
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return true;
    return [company.name, company.owner_email, company.owner_name]
      .filter(Boolean)
      .some((value) => value!.toLocaleLowerCase("tr-TR").includes(needle));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Şirketler</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan atayın, deneme süresini uzatın veya şirketleri askıya alın
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(["all", "trial", "active", "expired", "suspended"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setStatusFilter(key)}
            className={cn(
              "rounded-xl border bg-background p-4 text-left transition-colors hover:bg-accent",
              statusFilter === key && "border-primary ring-1 ring-primary"
            )}
          >
            <p className="text-xs text-muted-foreground">{key === "all" ? "Toplam" : ACCESS_STATUS_LABELS[key]}</p>
            <p className="mt-1 text-2xl font-semibold">{counts[key]}</p>
          </button>
        ))}
        <Link href="/admin/support" className="rounded-xl border bg-background p-4 transition-colors hover:bg-accent">
          <p className="text-xs text-muted-foreground">Açık talep</p>
          <p className={cn("mt-1 text-2xl font-semibold", openRequests > 0 && "text-amber-600")}>{openRequests}</p>
        </Link>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Şirket, yönetici adı veya e-posta"
          className="pl-9"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {initialCompanies.length === 0 ? "Henüz kayıtlı şirket yok." : "Aramaya uyan şirket yok."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((company) => (
            <Card key={company.id}>
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{company.name}</p>
                    <StatusBadge status={company.access_status} />
                    {company.open_requests > 0 && (
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                        {company.open_requests} açık talep
                      </Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {company.owner_name || "—"} · {company.owner_email || "—"}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm md:w-[420px]">
                  <div>
                    <p className="text-xs text-muted-foreground">{company.plan ? "Plan" : "Deneme bitişi"}</p>
                    <p className="font-medium">
                      {company.plan ?? formatDateTime(company.trial_ends_at)}
                    </p>
                    {company.plan && (
                      <p className="text-xs text-muted-foreground">
                        {company.plan_ends_at ? `${formatDate(company.plan_ends_at)} bitiş` : "Süresiz"}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Kullanıcı</p>
                    <p className="font-medium">
                      {company.approved_users}
                      {company.user_limit !== null && ` / ${company.user_limit}`}
                    </p>
                    {company.pending_users > 0 && (
                      <p className="text-xs text-muted-foreground">{company.pending_users} bekleyen</p>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Kayıt</p>
                    <p className="font-medium">{formatDate(company.created_at)}</p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => setSelected(company)}>
                  <Settings2 className="h-4 w-4" />
                  Yönet
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <ManageCompanyDialog
          company={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ManageCompanyDialog({
  company,
  onClose,
  onChanged,
}: {
  company: AdminCompany;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [plan, setPlan] = useState(company.plan ?? "");
  const [planEndsAt, setPlanEndsAt] = useState(toDateInput(company.plan_ends_at));
  const [userLimit, setUserLimit] = useState(company.user_limit?.toString() ?? "");
  const [trialEndsAt, setTrialEndsAt] = useState(toDateTimeInput(company.trial_ends_at));
  const [busy, setBusy] = useState<"save" | "suspend" | "delete" | null>(null);
  const [users, setUsers] = useState<AdminCompanyUser[] | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const repository = () => new AdminRepository(createClient());

  function addMonths(months: number) {
    const base = new Date(laterOf(planEndsAt ? `${planEndsAt}T23:59:59` : company.plan_ends_at));
    base.setMonth(base.getMonth() + months);
    setPlanEndsAt(toDateInput(base.toISOString()));
    if (!plan) setPlan(PLAN_PRESETS[0]);
  }

  function extendTrial(hours: number) {
    const base = new Date(laterOf(trialEndsAt ? new Date(trialEndsAt).toISOString() : company.trial_ends_at));
    setTrialEndsAt(toDateTimeInput(new Date(base.getTime() + hours * 3600000).toISOString()));
  }

  async function save() {
    const limit = userLimit.trim() === "" ? null : Number(userLimit);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      toast.error("Kullanıcı limiti 1 veya daha büyük bir tam sayı olmalı");
      return;
    }
    if (!trialEndsAt) {
      toast.error("Deneme bitiş tarihi zorunlu");
      return;
    }
    setBusy("save");
    try {
      await repository().updateCompany({
        companyId: company.id,
        plan: plan.trim() || null,
        planEndsAt: plan.trim() && planEndsAt ? new Date(`${planEndsAt}T23:59:59`).toISOString() : null,
        userLimit: limit,
        trialEndsAt: new Date(trialEndsAt).toISOString(),
      });
      toast.success(`${company.name} güncellendi`);
      onChanged();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setBusy(null);
    }
  }

  async function toggleSuspend() {
    const suspend = company.access_status !== "suspended";
    if (suspend && !window.confirm(`${company.name} askıya alınsın mı? Kullanıcıları panele erişemez.`)) return;
    setBusy("suspend");
    try {
      await repository().setSuspended(company.id, suspend);
      toast.success(suspend ? "Şirket askıya alındı" : "Şirket yeniden açıldı");
      onChanged();
    } catch (error) {
      toast.error("İşlem yapılamadı", { description: (error as Error)?.message });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("delete");
    try {
      await repository().deleteCompany(company.id, confirmName);
      toast.success(`${company.name} ve bütün verisi silindi`);
      onChanged();
    } catch (error) {
      toast.error("Silinemedi", { description: (error as Error)?.message });
    } finally {
      setBusy(null);
    }
  }

  async function loadUsers() {
    try {
      setUsers(await repository().listCompanyUsers(company.id));
    } catch (error) {
      toast.error("Kullanıcılar yüklenemedi", { description: (error as Error)?.message });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {company.name}
            <StatusBadge status={company.access_status} />
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Katılım kodu: <span className="font-mono font-semibold">{company.join_code}</span> · Kayıt:{" "}
            {formatDateTime(company.created_at)}
          </p>
        </DialogHeader>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold">Plan ve limit</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan">Plan adı</Label>
              <Input
                id="plan"
                list="plan-presets"
                value={plan}
                onChange={(event) => setPlan(event.target.value)}
                placeholder="Boş bırakılırsa deneme"
              />
              <datalist id="plan-presets">
                {PLAN_PRESETS.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-ends">Plan bitişi</Label>
              <Input
                id="plan-ends"
                type="date"
                value={planEndsAt}
                onChange={(event) => setPlanEndsAt(event.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                {[1, 3, 6, 12].map((months) => (
                  <Button key={months} type="button" size="sm" variant="outline" onClick={() => addMonths(months)}>
                    +{months === 12 ? "1 yıl" : `${months} ay`}
                  </Button>
                ))}
                {planEndsAt && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPlanEndsAt("")}>
                    Süresiz
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-limit">Kullanıcı limiti</Label>
              <Input
                id="user-limit"
                type="number"
                min={1}
                value={userLimit}
                onChange={(event) => setUserLimit(event.target.value)}
                placeholder="Sınırsız"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trial-ends">Deneme bitişi</Label>
              <Input
                id="trial-ends"
                type="datetime-local"
                value={trialEndsAt}
                onChange={(event) => setTrialEndsAt(event.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                <Button type="button" size="sm" variant="outline" onClick={() => extendTrial(48)}>
                  +48 saat
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => extendTrial(24 * 7)}>
                  +7 gün
                </Button>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Plan adı girilmişse şirket plan bitişine kadar (bitiş yoksa süresiz) aktif olur. Plan adı boşsa deneme
            bitişine kadar kullanılabilir.
          </p>
          <Button onClick={save} disabled={busy !== null}>
            {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
            Kaydet
          </Button>
        </section>

        <Separator />

        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">Erişim</h3>
            <p className="text-xs text-muted-foreground">
              Askıya alınan şirketin kullanıcıları panele giremez; veriler silinmez.
            </p>
          </div>
          <Button variant="outline" onClick={toggleSuspend} disabled={busy !== null}>
            {busy === "suspend" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : company.access_status === "suspended" ? (
              <Play className="h-4 w-4" />
            ) : (
              <Ban className="h-4 w-4" />
            )}
            {company.access_status === "suspended" ? "Askıdan çıkar" : "Askıya al"}
          </Button>
        </section>

        <Separator />

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              Kullanıcılar ({company.approved_users} onaylı, {company.pending_users} bekleyen)
            </h3>
            {users === null && (
              <Button size="sm" variant="ghost" onClick={loadUsers}>
                <Users className="h-4 w-4" />
                Listele
              </Button>
            )}
          </div>
          {users && (
            <ul className="divide-y rounded-lg border text-sm">
              {users.map((user) => (
                <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{user.full_name || "—"}</span>{" "}
                    <span className="text-muted-foreground">{user.email}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {user.is_approved ? USER_ROLE_LABELS[user.role] : "Onay bekliyor"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Separator />

        <section className="space-y-3 rounded-lg border border-destructive/40 p-4">
          <h3 className="text-sm font-semibold text-destructive">Şirketi sil</h3>
          <p className="text-xs text-muted-foreground">
            Şirketin bütün projeleri, personeli, puantajı, deposu ve diğer kayıtları kalıcı olarak silinir. Kullanıcı
            hesapları silinmez; şirketsiz kalırlar. Onaylamak için şirket adını yazın:{" "}
            <strong>{company.name}</strong>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={confirmName} onChange={(event) => setConfirmName(event.target.value)} placeholder={company.name} />
            <Button
              variant="destructive"
              onClick={remove}
              disabled={
                busy !== null ||
                confirmName.trim().toLocaleLowerCase("tr-TR") !== company.name.trim().toLocaleLowerCase("tr-TR")
              }
            >
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Kalıcı olarak sil
            </Button>
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
