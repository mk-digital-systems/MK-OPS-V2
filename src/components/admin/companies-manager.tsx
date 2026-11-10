"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { addMonths } from "date-fns";
import { Ban, History, Loader2, Play, Search, Settings2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { PAYMENT_METHOD_LABELS, type AdminCompany, type AdminCompanyHealth, type AdminCompanyUser, type Catalog, type PaymentMethod, type PlanPrice } from "@/types/admin";
import { USER_ROLE_LABELS, type CompanyAccessStatus } from "@/types/auth";
import {
  ACCESS_STATUS_CLASSES,
  ACCESS_STATUS_LABELS,
  CUSTOM_PLAN,
  PLAN_DURATION_MONTHS,
  PLAN_PRESETS,
  PLAN_PRESET_LIMITS,
  type PlanLimits,
} from "@/lib/constants/plans";
import { MONTH_LABELS, PLAN_MONTHS, formatTl, priceForMonths, type PlanMonths } from "@/lib/pricing";
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
import { AdminOverview, isIdleCompany } from "@/components/admin/admin-overview";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { userErrorMessage } from "@/lib/user-error";

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

function relativeDays(iso: string | null): string {
  if (!iso) return "Hiç";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "Bugün";
  if (days === 1) return "Dün";
  return `${days} gün önce`;
}

export function CompaniesManager({
  initialCompanies,
  catalogs,
  health = [],
  planPrices = [],
}: {
  initialCompanies: AdminCompany[];
  catalogs: Catalog[];
  health?: AdminCompanyHealth[];
  planPrices?: PlanPrice[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CompanyAccessStatus | "all">("all");
  const [selected, setSelected] = useState<AdminCompany | null>(null);
  const healthById = useMemo(() => new Map(health.map((item) => [item.company_id, item])), [health]);

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

      <AdminOverview companies={initialCompanies} health={healthById} onPick={setSelected} />

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
                    {catalogs
                      .filter((catalog) => catalog.company_ids.includes(company.id))
                      .map((catalog) => (
                        <Badge key={catalog.id} className="bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">
                          {catalog.name}
                        </Badge>
                      ))}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {company.owner_name || "—"} · {company.owner_email || "—"}
                  </p>
                  {healthById.has(company.id) && (
                    <HealthLine item={healthById.get(company.id)!} idle={isIdleCompany(company, healthById.get(company.id))} />
                  )}
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
          health={healthById.get(selected.id)}
          catalogs={catalogs}
          planPrices={planPrices}
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

function HealthLine({ item, idle }: { item: AdminCompanyHealth; idle: boolean }) {
  return (
    <p className="truncate text-xs text-muted-foreground">
      Son giriş: {relativeDays(item.last_sign_in_at)} · Son hareket: {relativeDays(item.last_activity_at)} ·{" "}
      {item.project_count} proje · {item.personnel_count} personel · {item.vehicle_count} araç
      {idle && <span className="ml-1 font-medium text-amber-600">· kurulum yapılmamış</span>}
    </p>
  );
}

function ManageCompanyDialog({
  company,
  health,
  catalogs,
  planPrices,
  onClose,
  onChanged,
}: {
  company: AdminCompany;
  health?: AdminCompanyHealth;
  catalogs: Catalog[];
  planPrices: PlanPrice[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [plan, setPlan] = useState(company.plan ?? "");
  const [planEndsAt, setPlanEndsAt] = useState(toDateInput(company.plan_ends_at));
  const [userLimit, setUserLimit] = useState(company.user_limit?.toString() ?? "");
  const [siteChiefLimit, setSiteChiefLimit] = useState(company.site_chief_limit?.toString() ?? "");
  const [managerLimit, setManagerLimit] = useState(company.manager_limit?.toString() ?? "");
  const [accountingLimit, setAccountingLimit] = useState(company.accounting_limit?.toString() ?? "");
  const [branchLimit, setBranchLimit] = useState(String(company.branch_limit ?? 0));
  // Hazır planlar fiyat listesinden gelir (süper admin Fiyat Listesi sayfasında düzenler); liste yoksa sabit değerler.
  const presetLimits = useMemo<Record<string, PlanLimits>>(
    () =>
      planPrices.length
        ? Object.fromEntries(
            planPrices
              .filter((item) => !item.is_custom && item.user_limit !== null)
              .map((item) => [
                item.name,
                {
                  users: item.user_limit as number,
                  siteChiefs: item.site_chief_limit ?? 1,
                  managers: item.manager_limit ?? 0,
                  accountants: item.accounting_limit ?? 0,
                  branches: item.branch_limit,
                },
              ])
          )
        : { ...PLAN_PRESET_LIMITS },
    [planPrices]
  );
  const presetNames = Object.keys(presetLimits);
  const presetPlan = presetNames.find((preset) => preset === plan);
  // Hazır planda sayılar kilitlidir; Özel (ve plan seçilmemiş / eski adlı) planda elle girilir.
  const limitsLocked = Boolean(presetPlan);

  function choosePlan(value: string) {
    setPlan(value);
    const preset = presetNames.find((item) => item === value);
    if (!preset) return;
    const limits = presetLimits[preset];
    setUserLimit(String(limits.users));
    setSiteChiefLimit(String(limits.siteChiefs));
    setManagerLimit(String(limits.managers));
    setAccountingLimit(String(limits.accountants));
    setBranchLimit(String(limits.branches));
  }
  const [trialEndsAt, setTrialEndsAt] = useState(toDateTimeInput(company.trial_ends_at));
  const [catalogIds, setCatalogIds] = useState<string[]>(
    catalogs.filter((catalog) => catalog.company_ids.includes(company.id)).map((catalog) => catalog.id)
  );
  const [busy, setBusy] = useState<"save" | "catalogs" | "suspend" | "delete" | null>(null);
  const [users, setUsers] = useState<AdminCompanyUser[] | null>(null);
  const [confirmName, setConfirmName] = useState("");
  const repository = () => new AdminRepository(createClient());

  function extendPlan(months: number) {
    // date-fns ay sonunu taşırmaz: 31 Ağustos + 6 ay = 28/29 Şubat (setMonth 3 Mart verir).
    const base = new Date(laterOf(planEndsAt ? `${planEndsAt}T23:59:59` : company.plan_ends_at));
    setPlanEndsAt(toDateInput(addMonths(base, months).toISOString()));
    if (!plan) setPlan(presetNames[0] ?? PLAN_PRESETS[0]);
  }

  function extendTrial(hours: number) {
    const base = new Date(laterOf(trialEndsAt ? new Date(trialEndsAt).toISOString() : company.trial_ends_at));
    setTrialEndsAt(toDateTimeInput(new Date(base.getTime() + hours * 3600000).toISOString()));
  }

  async function save() {
    const parse = (value: string) => (value.trim() === "" ? null : Number(value));
    const limit = parse(userLimit);
    const roleLimits = { siteChief: parse(siteChiefLimit), manager: parse(managerLimit), accounting: parse(accountingLimit) };
    const branches = Number(branchLimit.trim() === "" ? 0 : branchLimit);
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      toast.error("Kullanıcı limiti 1 veya daha büyük bir tam sayı olmalı");
      return;
    }
    for (const value of Object.values(roleLimits)) {
      if (value !== null && (!Number.isInteger(value) || value < 0)) {
        toast.error("Rol sayıları 0 veya daha büyük tam sayı olmalı");
        return;
      }
    }
    if (!Number.isInteger(branches) || branches < 0) {
      toast.error("Ek şube sayısı 0 veya daha büyük bir tam sayı olmalı");
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
        siteChiefLimit: roleLimits.siteChief,
        managerLimit: roleLimits.manager,
        accountingLimit: roleLimits.accounting,
        branchLimit: branches,
        trialEndsAt: new Date(trialEndsAt).toISOString(),
      });
      toast.success(`${company.name} güncellendi`);
      onChanged();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: userErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function saveCatalogs() {
    setBusy("catalogs");
    try {
      await repository().setCompanyCatalogs(company.id, catalogIds);
      toast.success("Kataloglar kaydedildi; türler firmaya kuruldu");
      onChanged();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: userErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function toggleSuspend() {
    const suspend = company.access_status !== "suspended";
    if (suspend && !(await confirm(`${company.name} askıya alınsın mı? Kullanıcıları panele erişemez.`))) return;
    setBusy("suspend");
    try {
      await repository().setSuspended(company.id, suspend);
      toast.success(suspend ? "Şirket askıya alındı" : "Şirket yeniden açıldı");
      onChanged();
    } catch (error) {
      toast.error("İşlem yapılamadı", { description: userErrorMessage(error) });
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
      toast.error("Silinemedi", { description: userErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function loadUsers() {
    try {
      setUsers(await repository().listCompanyUsers(company.id));
    } catch (error) {
      toast.error("Kullanıcılar yüklenemedi", { description: userErrorMessage(error) });
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

        {health && (
          <section className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Kullanım</h3>
              <Link
                href={`/admin/gecmis?firma=${company.id}`}
                className="flex items-center gap-1 text-xs font-medium text-primary underline"
              >
                <History className="h-3 w-3" />
                Bu firmanın işlem geçmişi
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-xs text-muted-foreground">Son giriş</p>
                <p className="font-medium">{health.last_sign_in_at ? formatDateTime(health.last_sign_in_at) : "Hiç"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Son hareket</p>
                <p className="font-medium">{health.last_activity_at ? formatDateTime(health.last_activity_at) : "Hiç"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Son 30 gün işlem</p>
                <p className="font-medium">{health.activity_30d}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Proje</p>
                <p className="font-medium">{health.project_count}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Personel</p>
                <p className="font-medium">{health.personnel_count}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Araç</p>
                <p className="font-medium">{health.vehicle_count}</p>
              </div>
            </div>
          </section>
        )}

        {planPrices.length > 0 && (
          <>
            <AssignPlanSection company={company} planPrices={planPrices} onChanged={onChanged} />
            <Separator />
          </>
        )}

        <section className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold">Elle düzenle: plan ve limit</h3>
            <p className="text-xs text-muted-foreground">Bu bölüm ödeme kaydı oluşturmaz; düzeltme ve özel durumlar içindir.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plan">Plan adı</Label>
              <select
                id="plan"
                className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                value={plan}
                onChange={(event) => choosePlan(event.target.value)}
              >
                <option value="">Plan yok (deneme)</option>
                {presetNames.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset} · {presetLimits[preset].users} kullanıcı
                  </option>
                ))}
                <option value={CUSTOM_PLAN}>{CUSTOM_PLAN} (her şeyi ben belirlerim)</option>
                {plan && plan !== CUSTOM_PLAN && !presetPlan && <option value={plan}>{plan} (eski ad)</option>}
              </select>
              {limitsLocked && <p className="text-xs text-muted-foreground">Hazır plan: sayılar plana göre dolar. Değiştirmek için Özel planı seçin.</p>}
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
                {PLAN_DURATION_MONTHS.map((months) => (
                  <Button key={months} type="button" size="sm" variant="outline" onClick={() => extendPlan(months)}>
                    +{months} ay
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
              <Label htmlFor="user-limit">Toplam kullanıcı</Label>
              <Input
                id="user-limit"
                type="number"
                min={1}
                disabled={limitsLocked}
                value={userLimit}
                onChange={(event) => setUserLimit(event.target.value)}
                placeholder="Sınırsız"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch-limit">Açabileceği ek şube (Merkez hariç)</Label>
              <Input
                id="branch-limit"
                type="number"
                min={0}
                disabled={limitsLocked}
                value={branchLimit}
                onChange={(event) => setBranchLimit(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Şu an {company.extra_branch_count ?? 0} ek şube açık. 0 = yalnızca Merkez.
              </p>
            </div>
            <div className="grid gap-4 sm:col-span-2 sm:grid-cols-3">
              {[
                { id: "limit-site-chief", label: "Firma yöneticisi", value: siteChiefLimit, set: setSiteChiefLimit, used: company.site_chief_count, min: 1 },
                { id: "limit-manager", label: "Şantiye şefi", value: managerLimit, set: setManagerLimit, used: company.manager_count, min: 0 },
                { id: "limit-accounting", label: "Muhasebe", value: accountingLimit, set: setAccountingLimit, used: company.accounting_count, min: 0 },
              ].map((role) => (
                <div key={role.id} className="space-y-2">
                  <Label htmlFor={role.id}>{role.label} sayısı</Label>
                  <Input
                    id={role.id}
                    type="number"
                    min={role.min}
                    disabled={limitsLocked}
                    value={role.value}
                    onChange={(event) => role.set(event.target.value)}
                    placeholder="Sınırsız"
                  />
                  <p className="text-xs text-muted-foreground">Şu an {role.used ?? 0} kullanıcı</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground sm:col-span-3">
                Rol sayıları toplamı: {(Number(siteChiefLimit) || 0) + (Number(managerLimit) || 0) + (Number(accountingLimit) || 0)}
                {userLimit.trim() !== "" && ` / toplam ${userLimit}`}. Boş bırakılan rol sınırsızdır.
              </p>
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

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Kataloglar (sektörler)</h3>
            <p className="text-xs text-muted-foreground">
              Seçilen katalogların proje türleri firmaya kurulur. Kaldırılan kataloğun türleri arşivlenir; projeler etkilenmez.
            </p>
          </div>
          {catalogs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Henüz katalog yok. <Link href="/admin/kataloglar" className="font-medium text-primary underline">Kataloglar</Link> sayfasından oluşturun.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {catalogs.map((catalog) => (
                <label key={catalog.id} className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/30 p-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-primary"
                    checked={catalogIds.includes(catalog.id)}
                    onChange={(event) =>
                      setCatalogIds((current) =>
                        event.target.checked ? [...current, catalog.id] : current.filter((id) => id !== catalog.id)
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{catalog.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {catalog.types.length ? catalog.types.map((type) => type.name).join(", ") : "Tür yok"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={saveCatalogs} disabled={busy !== null || catalogs.length === 0}>
              {busy === "catalogs" && <Loader2 className="h-4 w-4 animate-spin" />}
              Katalogları kaydet
            </Button>
            <Button asChild variant="outline">
              <Link href={`/admin/sirketler/${company.id}/poz`}>Poz listesini aç</Link>
            </Button>
          </div>
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

const todayInput = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Ödeme alındı: planı ata + ödemeyi gelir listesine yaz (tek işlem). */
function AssignPlanSection({
  company,
  planPrices,
  onChanged,
}: {
  company: AdminCompany;
  planPrices: PlanPrice[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const initialPlan = planPrices.find((item) => item.name === company.plan) ?? planPrices[0];
  const [planName, setPlanName] = useState(initialPlan?.name ?? "");
  const [months, setMonths] = useState<PlanMonths>(3);
  const plan = planPrices.find((item) => item.name === planName);
  const listPrice = plan ? priceForMonths(plan, months) : null;
  const [amount, setAmount] = useState(listPrice === null ? "" : String(listPrice));
  const [touched, setTouched] = useState(false);
  const [paidOn, setPaidOn] = useState(todayInput());
  const [method, setMethod] = useState<PaymentMethod>("eft");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function pick(nextPlan: string, nextMonths: PlanMonths) {
    setPlanName(nextPlan);
    setMonths(nextMonths);
    const target = planPrices.find((item) => item.name === nextPlan);
    const price = target ? priceForMonths(target, nextMonths) : null;
    if (!touched) setAmount(price === null ? "" : String(price));
  }

  // Önizleme: aynı plansa mevcut bitişten uzar, farklı plansa bugünden başlar (sunucu aynı kuralı uygular).
  const sameRenewal = Boolean(plan && company.plan === plan.name && company.plan_ends_at);
  const startMs = sameRenewal ? Math.max(Date.now(), new Date(company.plan_ends_at as string).getTime()) : Date.now();
  const newEnd = addMonths(new Date(startMs), months);
  const amountNumber = amount.trim() === "" ? NaN : Number(amount);

  async function submit() {
    if (!plan) return;
    if (!Number.isFinite(amountNumber) || amountNumber < 0) {
      toast.error("Alınan ödeme tutarını girin");
      return;
    }
    const ok = await confirm(
      `${company.name}: ${plan.name} planı, ${MONTH_LABELS[months]}, ${formatTl(amountNumber)} ödeme kaydedilsin ve plan atansın mı? Yeni bitiş yaklaşık ${formatDate(newEnd.toISOString())}.`
    );
    if (!ok) return;
    setBusy(true);
    try {
      const result = await new AdminRepository(createClient()).assignPlan({
        companyId: company.id,
        plan: plan.name,
        months,
        amount: amountNumber,
        paidOn,
        method,
        note: note.trim() || null,
      });
      toast.success(`Plan atandı, ödeme kaydedildi. Bitiş: ${formatDate(result.period_end)}`);
      onChanged();
    } catch (error) {
      toast.error("Plan atanamadı", { description: userErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div>
        <h3 className="text-sm font-semibold">Ödeme alındı, planı ata</h3>
        <p className="text-xs text-muted-foreground">
          EFT/havale ulaşınca burayı kullanın: plan, süre ve limitler fiyat listesinden atanır, alınan tutar Gelir ve Ödemeler
          listesine yazılır. Aynı plan yenilenirse süre mevcut bitişe eklenir; farklı plana geçilirse bugünden başlar.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="assign-plan">Paket</Label>
          <select
            id="assign-plan"
            className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            value={planName}
            onChange={(event) => pick(event.target.value, months)}
          >
            {planPrices.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
                {item.is_custom ? " (özel teklif; limitler korunur)" : ` · ${item.user_limit} kullanıcı`}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Süre</Label>
          <div className="flex gap-1">
            {PLAN_MONTHS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={months === value ? "default" : "outline"}
                onClick={() => pick(planName, value)}
              >
                {MONTH_LABELS[value]}
              </Button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="assign-amount">Alınan tutar (₺, KDV dahil)</Label>
          <Input
            id="assign-amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(event) => {
              setTouched(true);
              setAmount(event.target.value);
            }}
          />
          <p className="text-xs text-muted-foreground">
            {listPrice !== null ? `Liste fiyatı: ${formatTl(listPrice)}. İndirim yaptıysanız tutarı değiştirin.` : "Özel teklif: tutarı elle girin."}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="assign-paid">Ödeme tarihi</Label>
          <Input id="assign-paid" type="date" max={todayInput()} value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="assign-method">Yöntem</Label>
          <select
            id="assign-method"
            className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
            value={method}
            onChange={(event) => setMethod(event.target.value as PaymentMethod)}
          >
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((key) => (
              <option key={key} value={key}>{PAYMENT_METHOD_LABELS[key]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="assign-note">Not (isteğe bağlı)</Label>
          <Input id="assign-note" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} placeholder="Örn. dekont no" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Yeni bitiş (yaklaşık): <strong>{formatDate(newEnd.toISOString())}</strong>
        {company.plan_ends_at && company.plan && ` · şu an: ${company.plan}, ${formatDate(company.plan_ends_at)}`}
      </p>
      <Button onClick={submit} disabled={busy || !plan || paidOn === ""}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        Planı ata ve ödemeyi kaydet
      </Button>
    </section>
  );
}
