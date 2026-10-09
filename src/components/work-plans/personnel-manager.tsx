"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CalendarDays,
  Loader2,
  Pencil,
  Plus,
  Printer,
  UserMinus,
  UserPlus,
  UserRound,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Personnel } from "@/types/work-plan";
import type { Vehicle } from "@/types/vehicle";
import type { PersonnelAttendanceSummary } from "@/types/attendance";
import type { PersonnelListSummary } from "@/types/attendance";
import { MONTH_NAMES } from "@/lib/constants/attendance";
import { formatEmploymentDuration } from "@/lib/personnel";
import { formatDate } from "@/lib/utils";
import {
  personnelSchema,
  type PersonnelFormValues,
} from "@/lib/validations/work-plan";
import { createClient } from "@/lib/supabase/client";
import { PersonnelRepository } from "@/modules/work-plans/personnel-repository";
import { InventoryRepository } from "@/modules/inventory/inventory-repository";
import { useReportBrand } from "@/components/layout/company-brand-provider";
import { PendingApprovalsCard } from "@/components/approvals/pending-approvals-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  initialPersonnel: Personnel[];
  attendanceSummary?: PersonnelAttendanceSummary | null;
  personnelSummaries?: PersonnelListSummary[];
  assignedVehicles?: Vehicle[];
  summaryYear?: number;
  summaryMonth?: number;
  readOnly?: boolean;
  /** Yeni personel ekleyebilir (muhasebenin eklediği kayıt onaya düşer). */
  canCreate?: boolean;
  /** Bekleyen kayıtları onaylayabilir (şantiye şefi, firma yöneticisi). */
  canReview?: boolean;
  currentUserId?: string | null;
  /** Taşeron hesapları (personelden açılanlarda personnel_id dolu). */
  subcontractors?: SubcontractorOption[];
};

export type SubcontractorOption = {
  id: string;
  name: string;
  is_active: boolean;
  personnel_id: string | null;
  share_percent: number;
  iban: string | null;
  tax_number: string | null;
};

/** Form değeri: bu personel taşeronun kendisi. */
const SELF = "__self__";

export function PersonnelManager({
  initialPersonnel,
  attendanceSummary,
  personnelSummaries = [],
  assignedVehicles = [],
  summaryYear = new Date().getFullYear(),
  summaryMonth = new Date().getMonth() + 1,
  readOnly = false,
  canCreate = !readOnly,
  canReview = false,
  currentUserId = null,
  subcontractors = [],
}: Props) {
  const router = useRouter();
  const brand = useReportBrand();
  const [items, setItems] = useState(initialPersonnel);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Personnel | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [showPassive, setShowPassive] = useState(false);
  const [terminating, setTerminating] = useState<Personnel | null>(null);
  const [terminationDate, setTerminationDate] = useState("");
  const [terminationReason, setTerminationReason] = useState("");
  const [reactivating, setReactivating] = useState<Personnel | null>(null);
  const [reactivationDate, setReactivationDate] = useState("");
  const [deleting, setDeleting] = useState<Personnel | null>(null);

  const form = useForm<PersonnelFormValues>({
    resolver: zodResolver(personnelSchema),
    defaultValues: {
      full_name: "",
      job_title: "",
      phone: "",
      tc_identity_number: "",
      employment_start_date: "",
      employment_end_date: "",
      monthly_salary: 0,
      is_active: true,
      notes: "",
      subcontractor_id: "",
      share_percent: "",
      sub_iban: "",
      sub_tax_number: "",
    },
  });

  function openCreate() {
    setEditing(null);
    form.reset({
      full_name: "",
      job_title: "",
      phone: "",
      tc_identity_number: "",
      employment_start_date: "",
      employment_end_date: "",
      monthly_salary: 0,
      is_active: true,
      notes: "",
      subcontractor_id: "",
      share_percent: "",
      sub_iban: "",
      sub_tax_number: "",
    });
    setOpen(true);
  }

  function openEdit(person: Personnel) {
    const ownSub = subcontractors.find((sub) => sub.personnel_id === person.id && sub.is_active);
    setEditing(person);
    form.reset({
      full_name: person.full_name,
      job_title: person.job_title ?? "",
      phone: person.phone ?? "",
      tc_identity_number: person.tc_identity_number ?? "",
      employment_start_date: person.employment_start_date ?? "",
      employment_end_date: person.employment_end_date ?? "",
      monthly_salary: person.monthly_salary ?? 0,
      is_active: person.is_active,
      notes: person.notes ?? "",
      subcontractor_id: ownSub && person.subcontractor_id === ownSub.id ? SELF : person.subcontractor_id ?? "",
      share_percent: ownSub ? String(ownSub.share_percent) : "",
      sub_iban: ownSub?.iban ?? "",
      sub_tax_number: ownSub?.tax_number ?? "",
    });
    setOpen(true);
  }

  function openTermination(person: Personnel) {
    setTerminating(person);
    setTerminationDate(
      new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
    );
    setTerminationReason("");
  }

  async function terminatePersonnel() {
    if (!terminating || !terminationDate || !terminationReason.trim()) {
      toast.error("Çıkış tarihi ve çıkış sebebi zorunludur");
      return;
    }
    if (
      terminating.employment_start_date &&
      terminationDate < terminating.employment_start_date
    ) {
      toast.error("Çıkış tarihi işe giriş tarihinden önce olamaz");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");

      const custody = await new InventoryRepository(
        supabase
      ).listPersonnelCustodyBalances(terminating.id);
      if (custody.length > 0) {
        toast.error("Personel çıkışı kaydedilemez", {
          description: `Üzerinde ${custody.length} aktif malzeme zimmeti var. Önce zimmetleri aktarın veya depoya iade edin.`,
        });
        return;
      }

      const updated = await new PersonnelRepository(supabase).terminate(
        terminating.id,
        {
          employment_end_date: terminationDate,
          termination_reason: terminationReason,
          updated_by: user.id,
        }
      );
      setItems((previous) =>
        sortByCreatedAtDesc(
          previous.map((person) =>
            person.id === updated.id ? updated : person
          )
        )
      );
      setTerminating(null);
      toast.success("Personel çıkışı kaydedildi ve personel pasife alındı");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Personel çıkışı kaydedilemedi", {
        description: (error as Error)?.message,
      });
    } finally {
      setLoading(false);
    }
  }

  function openReactivation(person: Personnel) {
    setReactivating(person);
    setReactivationDate(
      new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Istanbul" })
    );
  }

  async function reactivatePersonnel() {
    if (!reactivating || !reactivationDate) {
      toast.error("Yeni işe giriş tarihi zorunludur");
      return;
    }
    if (
      reactivating.employment_end_date &&
      reactivationDate <= reactivating.employment_end_date
    ) {
      toast.error("Yeni işe giriş tarihi son çıkış tarihinden sonra olmalıdır");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");

      const updated = await new PersonnelRepository(supabase).reactivate(
        reactivating.id,
        reactivationDate,
        user.id
      );
      setItems((previous) =>
        sortByCreatedAtDesc(
          previous.map((person) =>
            person.id === updated.id ? updated : person
          )
        )
      );
      setReactivating(null);
      toast.success("Personel yeniden aktif edildi");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Personel yeniden aktif edilemedi", {
        description: (error as Error)?.message,
      });
    } finally {
      setLoading(false);
    }
  }

  async function deletePersonnel() {
    if (!deleting) return;
    setLoading(true);
    try {
      await new PersonnelRepository(
        createClient()
      ).deleteInactiveWithoutEarnedDays(deleting.id);
      setItems((previous) =>
        previous.filter((person) => person.id !== deleting.id)
      );
      setDeleting(null);
      toast.success("Personel kaydı tamamen silindi");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Personel silinemedi", {
        description: (error as Error)?.message,
      });
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(values: PersonnelFormValues) {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Oturum bulunamadı");
      setLoading(false);
      return;
    }

    if (editing?.is_active && !values.is_active) {
      try {
        const custody = await new InventoryRepository(
          supabase
        ).listPersonnelCustodyBalances(editing.id);
        if (custody.length > 0) {
          toast.error("Personel pasife alınamaz", {
            description: `Üzerinde ${custody.length} aktif malzeme zimmeti var. Önce zimmetleri başka personele/ekibe aktarın veya depoya iade edin.`,
          });
          setLoading(false);
          return;
        }
      } catch (error) {
        console.error(error);
        toast.error("Personel zimmetleri kontrol edilemedi");
        setLoading(false);
        return;
      }
    }

    const repo = new PersonnelRepository(supabase);
    const { subcontractor_id: workFor = "", share_percent, sub_iban, sub_tax_number, ...personValues } = values;
    const isSelf = workFor === SELF;
    const sharePercent = Number((share_percent ?? "").replace(",", "."));
    if (isSelf && (!Number.isFinite(sharePercent) || sharePercent <= 0 || sharePercent > 100)) {
      toast.error("Taşeron payı 0'dan büyük, en fazla 100 olmalı");
      setLoading(false);
      return;
    }
    const ownSub = editing ? subcontractors.find((sub) => sub.personnel_id === editing.id && sub.is_active) : undefined;
    const wasSelf = !!(editing && ownSub && editing.subcontractor_id === ownSub.id);

    try {
      // Taşeronluk kaldırılıyorsa önce hesap pasife alınır.
      if (editing && wasSelf && !isSelf) await repo.setSubcontractor(editing.id, false);
      let saved: Personnel;
      if (editing) {
        saved = await repo.update(editing.id, {
          ...personValues,
          ...(isSelf ? {} : { subcontractor_id: workFor || null }),
          job_title: values.job_title || null,
          phone: values.phone || null,
          tc_identity_number: values.tc_identity_number || null,
          notes: values.notes || null,
          updated_by: user.id,
        });
      } else {
        saved = await repo.create({
          ...personValues,
          subcontractor_id: isSelf ? null : workFor || null,
          job_title: values.job_title || null,
          phone: values.phone || null,
          tc_identity_number: values.tc_identity_number || null,
          notes: values.notes || null,
          created_by: user.id,
          updated_by: user.id,
        });
      }
      if (isSelf) {
        await repo.setSubcontractor(saved.id, true, {
          share_percent: sharePercent,
          iban: sub_iban || null,
          tax_number: sub_tax_number || null,
        });
        saved = (await repo.getById(saved.id)) ?? saved;
      }
      setItems((prev) => sortByCreatedAtDesc([...prev.filter((p) => p.id !== saved.id), saved]));
      toast.success(
        saved.approval_status === "pending"
          ? "Personel eklendi; şantiye şefi veya firma yöneticisi onaylayınca kullanıma açılır"
          : editing
            ? "Personel güncellendi"
            : "Personel eklendi"
      );
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Personel kaydedilemedi", {
        description: (error as Error)?.message,
      });
    } finally {
      setLoading(false);
    }
  }

  const pendingItems = items.filter((person) => person.approval_status === "pending");
  const approvedItems = items.filter((person) => person.approval_status !== "pending");
  const activeCount = approvedItems.filter((person) => person.is_active).length;
  const passiveCount = approvedItems.length - activeCount;

  async function reviewPersonnel(id: string, approve: boolean) {
    try {
      await new PersonnelRepository(createClient()).review(id, approve);
      setItems((prev) =>
        approve
          ? prev.map((p) => (p.id === id ? { ...p, approval_status: "approved" } : p))
          : prev.filter((p) => p.id !== id)
      );
      toast.success(approve ? "Personel onaylandı" : "Personel kaydı reddedildi");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("İşlem yapılamadı", { description: (error as Error)?.message });
    }
  }

  const filtered = sortByCreatedAtDesc(approvedItems).filter((p) => {
    if (p.is_active === showPassive) return false;
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      p.full_name.toLowerCase().includes(q) ||
      (p.job_title ?? "").toLowerCase().includes(q) ||
      (p.phone ?? "").toLowerCase().includes(q) ||
      (p.tc_identity_number ?? "").includes(q) ||
      (p.notes ?? "").toLowerCase().includes(q)
    );
  });
  const summaryByPersonnel = new Map(
    personnelSummaries.map((summary) => [summary.personnel_id, summary])
  );

  function printPersonnelList() {
    const rows = filtered
      .map(
        (person) =>
          `<tr><td>${escapeHtml(person.full_name)}</td><td>${escapeHtml(
            person.phone || "—"
          )}</td><td>${person.is_active ? "Aktif" : "Pasif"}</td><td>${escapeHtml(
            person.employment_start_date || "—"
          )}</td><td>${escapeHtml(person.employment_end_date || "—")}</td></tr>`
      )
      .join("");
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) {
      toast.error("Yazdırma penceresi açılamadı");
      return;
    }
    printWindow.document.write(
      `<!doctype html><html><head><title>Personel Listesi</title><style>body{font-family:Arial,sans-serif;padding:24px}h1{font-size:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #bbb;padding:8px;text-align:left}th{background:#eee}</style></head><body><h1>${escapeHtml(brand.name)} — Personel Listesi</h1><table><thead><tr><th>Ad Soyad</th><th>Telefon</th><th>Durum</th><th>İşe Giriş</th><th>İşten Ayrılış</th></tr></thead><tbody>${rows}</tbody></table></body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {showPassive ? "Pasif Personeller" : "Aktif Personeller"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {showPassive ? passiveCount : activeCount} personel · Yeni
            kayıttan eskiye sıralı
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowPassive((current) => !current);
              setFilter("");
            }}
          >
            {showPassive
              ? `Aktif Personeller (${activeCount})`
              : `Pasif Personeller (${passiveCount})`}
          </Button>
          <Button variant="outline" onClick={printPersonnelList}>
            <Printer className="h-4 w-4" />
            Listeyi Yazdır
          </Button>
          {canCreate && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Personel Ekle
            </Button>
          )}
        </div>
      </div>

      {attendanceSummary && (
        <Card className="border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/25">
          <CardHeader className="pb-3">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-blue-100 p-2 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                <CalendarDays className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base">
                  {attendanceSummary.full_name} · Puantaj Notu
                </CardTitle>
                <CardDescription>
                  {MONTH_NAMES[attendanceSummary.month - 1]}{" "}
                  {attendanceSummary.year}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium leading-6">
              {attendanceSummary.worked} gün çalıştı,{" "}
              {attendanceSummary.absent} gün çalışmadı,{" "}
              {attendanceSummary.leave} gün izinli,{" "}
              {attendanceSummary.medical_report} gün raporlu ve{" "}
              {attendanceSummary.weekly_rest} gün hafta tatili.
            </p>
          </CardContent>
        </Card>
      )}

      <PendingApprovalsCard
        noun="personel"
        items={pendingItems.map((person) => ({
          id: person.id,
          title: person.full_name,
          subtitle: [person.job_title, person.phone].filter(Boolean).join(" · ") || null,
          createdBy: person.created_by,
          createdAt: person.created_at,
        }))}
        canReview={canReview}
        currentUserId={currentUserId}
        onReview={reviewPersonnel}
        onEdit={(id) => {
          const person = items.find((p) => p.id === id);
          if (person) openEdit(person);
        }}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {showPassive ? "Pasif Personeller" : "Aktif Personeller"}
          </CardTitle>
          <CardDescription>
            {showPassive
              ? "Pasife alınmış personellerin geçmiş kayıtları korunur."
              : "Aktif personeller günlük planda seçilebilir."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Ad, görev, telefon, TC Kimlik No veya not ara..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />

          <div className="space-y-2">
            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Personel bulunamadı.
              </p>
            ) : (
              groupBySubcontractor(filtered, subcontractors).map(({ person, header, indent }) => {
                const summary = summaryByPersonnel.get(person.id);
                const assignedVehicle = assignedVehicles.find(
                  (vehicle) => vehicle.assigned_personnel_id === person.id
                );
                return (
                <Fragment key={person.id}>
                {header && (
                  <p className="px-1 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{header}</p>
                )}
                <div
                  className={`flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between ${indent ? "ml-6 border-l-4 border-l-violet-300 dark:border-l-violet-800" : ""} ${
                    attendanceSummary?.personnel_id === person.id
                      ? "border-blue-400 bg-blue-50 ring-1 ring-blue-300 dark:border-blue-800 dark:bg-blue-950/30"
                      : ""
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 rounded-xl bg-muted p-2">
                      <UserRound className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/panel/personnel/${person.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {person.full_name}
                        </Link>
                        <Badge
                          className={
                            person.is_active
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                          }
                        >
                          {person.is_active ? "Aktif" : "Pasif"}
                        </Badge>
                        {assignedVehicle && (
                          <Badge className="border bg-background text-foreground">
                            {assignedVehicle.plate}
                          </Badge>
                        )}
                        {person.subcontractor_id && (
                          <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                            Taşeron{subcontractors.find((sub) => sub.id === person.subcontractor_id)?.name ? `: ${subcontractors.find((sub) => sub.id === person.subcontractor_id)?.name}` : ""}
                          </Badge>
                        )}
                      </div>
                      {person.job_title && (
                        <p className="text-sm text-muted-foreground">
                          {person.job_title}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {person.phone || "Telefon yok"}
                        {person.notes ? ` · ${person.notes}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        TC Kimlik No: {maskTcIdentityNumber(person.tc_identity_number)}
                      </p>
                      <div className="mt-2 grid gap-x-5 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                        <span>
                          İşe Giriş: {formatDate(person.employment_start_date)}
                        </span>
                        <span>
                          Çalışma Süresi:{" "}
                          {formatEmploymentDuration(
                            person.employment_start_date,
                            person.employment_end_date
                          )}
                        </span>
                        <span>
                          {MONTH_NAMES[summaryMonth - 1]} Çalıştı:{" "}
                          <strong>{summary?.month_worked ?? 0} gün</strong>
                        </span>
                        <span>
                          {summaryYear} İzin:{" "}
                          <strong>{summary?.year_leave ?? 0} gün</strong>
                        </span>
                      </div>
                      {!person.is_active && person.termination_reason && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Çıkış Sebebi: {person.termination_reason}
                        </p>
                      )}
                    </div>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-2">
                      {person.is_active && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openTermination(person)}
                        >
                          <UserMinus className="h-4 w-4" />
                          İşten Çıkış
                        </Button>
                      )}
                      {!person.is_active && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReactivation(person)}
                        >
                          <UserPlus className="h-4 w-4" />
                          Yeniden İşe Al
                        </Button>
                      )}
                      {!person.is_active && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive"
                          title="Personeli tamamen sil"
                          onClick={() => setDeleting(person)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(person)}
                      >
                        <Pencil className="h-4 w-4" />
                        Düzenle
                      </Button>
                    </div>
                  )}
                </div>
                </Fragment>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Personeli Düzenle" : "Yeni Personel"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Ad Soyad</Label>
              <Input id="full_name" {...form.register("full_name")} />
              {form.formState.errors.full_name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.full_name.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly_salary">Aylık Maaş (₺)</Label>
              <Input
                id="monthly_salary"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                {...form.register("monthly_salary")}
              />
              {form.formState.errors.monthly_salary && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.monthly_salary.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="job_title">Görev Bilgisi (Opsiyonel)</Label>
              <Input
                id="job_title"
                placeholder="Örn. Kepçe Operatörü"
                {...form.register("job_title")}
              />
              {form.formState.errors.job_title && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.job_title.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Telefon</Label>
              <Input id="phone" {...form.register("phone")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tc_identity_number">TC Kimlik No</Label>
              <Input
                id="tc_identity_number"
                inputMode="numeric"
                autoComplete="off"
                maxLength={11}
                {...form.register("tc_identity_number")}
                onInput={(event) => {
                  event.currentTarget.value = event.currentTarget.value
                    .replace(/\D/g, "")
                    .slice(0, 11);
                }}
              />
              {form.formState.errors.tc_identity_number && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.tc_identity_number.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="employment_start_date">İşe Giriş Tarihi</Label>
              <Input
                id="employment_start_date"
                type="date"
                {...form.register("employment_start_date")}
              />
            </div>
            <div className="space-y-2">
              <Label>Durum</Label>
              <Select
                disabled
                value={form.watch("is_active") ? "active" : "passive"}
                onValueChange={(v) => {
                  const isActive = v === "active";
                  form.setValue("is_active", isActive);
                  if (isActive) form.setValue("employment_end_date", "");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="passive">Pasif</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {!form.watch("is_active") && (
              <div className="space-y-2">
                <Label htmlFor="employment_end_date">
                  İşten Ayrılış Tarihi
                </Label>
                <Input
                  id="employment_end_date"
                  type="date"
                  {...form.register("employment_end_date")}
                />
                {form.formState.errors.employment_end_date && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.employment_end_date.message}
                  </p>
                )}
              </div>
            )}
            {(canReview || subcontractors.length > 0) && (
              <div className="space-y-2 rounded-xl border p-3">
                <Label htmlFor="subcontractor_id">Kime çalışıyor?</Label>
                <select
                  id="subcontractor_id"
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  {...form.register("subcontractor_id")}
                >
                  <option value="">Firma (kendi personelimiz)</option>
                  {(canReview || form.watch("subcontractor_id") === SELF) && (
                    <option value={SELF}>Bu kişi taşeron (kendi ekibiyle çalışıyor)</option>
                  )}
                  {subcontractors
                    .filter((sub) => (sub.is_active || sub.id === form.getValues("subcontractor_id")) && sub.personnel_id !== editing?.id)
                    .map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        Taşeron: {sub.name}
                      </option>
                    ))}
                </select>
                {form.watch("subcontractor_id") === SELF && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label htmlFor="share_percent">Taşeron payı (%)</Label>
                      <Input id="share_percent" inputMode="decimal" placeholder="ör. 70" {...form.register("share_percent")} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sub_iban">IBAN (isteğe bağlı)</Label>
                      <Input id="sub_iban" {...form.register("sub_iban")} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sub_tax_number">Vergi no (isteğe bağlı)</Label>
                      <Input id="sub_tax_number" {...form.register("sub_tax_number")} />
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  {form.watch("subcontractor_id") === SELF
                    ? "Bu kişinin ve ekibinin imalatı, hakediş tutarının bu yüzdesiyle taşeron hesabına yazılır. Maaşı girilmişse firma öder ve taşeron alacağından düşer."
                    : "Taşeron işçisinin puantajı tutulur, firmanın maaş dökümüne girmez. Maaşı girilmişse firma öder ve taşeron alacağından düşer; maaşı 0 ise taşeron kendisi öder."}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="notes">Not</Label>
              <Textarea id="notes" {...form.register("notes")} />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading && <Loader2 className="animate-spin" />}
              Kaydet
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !loading) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Personeli Kalıcı Olarak Sil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {deleting?.full_name} personel kaydı kalıcı olarak silinecek.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => setDeleting(null)}
              >
                Vazgeç
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={loading}
                onClick={deletePersonnel}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Kalıcı Sil
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(reactivating)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !loading) setReactivating(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Personeli Yeniden İşe Al</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {reactivating?.full_name}
            </p>
            <div className="space-y-2">
              <Label htmlFor="reactivation_date">Yeni İşe Giriş Tarihi</Label>
              <Input
                id="reactivation_date"
                type="date"
                min={reactivating?.employment_end_date ?? undefined}
                value={reactivationDate}
                onChange={(event) => setReactivationDate(event.target.value)}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={loading}
              onClick={reactivatePersonnel}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Yeniden Aktif Et
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(terminating)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !loading) setTerminating(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Personel İşten Çıkış Kaydı</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {terminating?.full_name} pasife alınacak. Geçmiş puantaj kayıtları
              korunacaktır.
            </p>
            <div className="space-y-2">
              <Label htmlFor="termination_date">Çıkış Tarihi</Label>
              <Input
                id="termination_date"
                type="date"
                value={terminationDate}
                onChange={(event) => setTerminationDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="termination_reason">Çıkış Sebebi</Label>
              <Textarea
                id="termination_reason"
                maxLength={1000}
                value={terminationReason}
                onChange={(event) => setTerminationReason(event.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              className="w-full"
              disabled={loading}
              onClick={terminatePersonnel}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserMinus className="h-4 w-4" />
              )}
              Çıkışı Kaydet
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character]!
  );
}

function sortByCreatedAtDesc(personnel: Personnel[]) {
  return [...personnel].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
  );
}

function maskTcIdentityNumber(value: string | null) {
  if (!value) return "Girilmemiş";
  return `${value.slice(0, 3)}******${value.slice(-2)}`;
}

/** Firma personeli önce; ardından her taşeron (önce taşeronun kendisi, sonra işçileri, girintili). */
function groupBySubcontractor(people: Personnel[], subcontractors: SubcontractorOption[]) {
  const subById = new Map(subcontractors.map((sub) => [sub.id, sub]));
  const own = people.filter((person) => !person.subcontractor_id || !subById.has(person.subcontractor_id));
  const result: { person: Personnel; header: string | null; indent: boolean }[] = own.map((person) => ({ person, header: null, indent: false }));
  const groups = [...new Set(people.map((person) => person.subcontractor_id).filter((id): id is string => !!id && subById.has(id)))]
    .map((id) => subById.get(id)!)
    .sort((a, b) => a.name.localeCompare(b.name, "tr"));
  for (const sub of groups) {
    const members = people
      .filter((person) => person.subcontractor_id === sub.id)
      .sort((a, b) => Number(b.id === sub.personnel_id) - Number(a.id === sub.personnel_id));
    members.forEach((person, index) =>
      result.push({
        person,
        header: index === 0 ? `Taşeron: ${sub.name} · %${Number(sub.share_percent)}${sub.is_active ? "" : " (pasif)"}` : null,
        indent: person.id !== sub.personnel_id,
      })
    );
  }
  return result;
}
