"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArchiveRestore, Ban, Copy, Eye, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Project, ProjectSheet, ProjectCabinet } from "@/types/project";
import type { Personnel } from "@/types/work-plan";
import { ProjectSheetProgress } from "@/components/projects/project-sheet-progress";
import { BgfdCabinetProgress } from "@/components/projects/bgfd-cabinet-progress";
import { HpFocusedSheetManager } from "@/components/projects/hp-focused-sheet-manager";
import {
  PROJECT_STATUSES,
  formatBooleanChoice,
  isBfOrGfProject,
  isOngoingProjectStatus,
  isCorporateStyleProject,
} from "@/lib/constants/project";
import { formatDate, formatDateTime } from "@/lib/utils";
import { getDisplayImageUrl } from "@/lib/project-image-url";
import { createClient } from "@/lib/supabase/client";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectStatusIndicators } from "@/components/projects/project-status-indicators";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  project: Project;
  typeLabel: string;
  readOnly?: boolean;
  sheets: ProjectSheet[];
  personnel: Personnel[];
  cabinets: ProjectCabinet[];
};

export function ProjectDetail({ project, typeLabel, sheets, personnel, cabinets, readOnly = false }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [cancellationReason, setCancellationReason] = useState("");
  const isBfOrGf = isBfOrGfProject(project.project_type);
  const isHpFocused = project.project_type === "HP_ODAKLI";
  const tracksObk = isBfOrGf && project.tracks_obk;
  const isOngoing = isOngoingProjectStatus(project.status);
  const canCancel = !project.is_archived && !project.is_cancelled && (project.status === "waiting" || project.status === "in_progress");
  const progressCount = sheets.reduce((total, sheet) => total + sheet.progress.length, 0) + cabinets.reduce((total, cabinet) => total + cabinet.progress.length, 0);

  async function handleCopyImageUrl() {
    if (!project.image_url) return;
    try {
      await navigator.clipboard.writeText(project.image_url);
      toast.success("Görsel URL kopyalandı.");
    } catch {
      toast.error("Görsel URL kopyalanamadı.");
    }
  }

  async function handleCancel() {
    if (cancellationReason.trim().length < 3) {
      toast.error("İptal sebebi en az 3 karakter olmalıdır");
      return;
    }
    setLoading(true);
    try {
      await new ProjectRepository(createClient()).cancel(project.id, cancellationReason);
      toast.success("Proje iptal alanına taşındı");
      router.push(`/projects/${project.id}`);
      router.refresh();
      setCancelOpen(false);
    } catch (error) {
      toast.error("Proje iptal edilemedi", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function handleReactivate() {
    setLoading(true);
    const supabase = createClient();
    try {
      await new ProjectRepository(supabase).reactivate(project.id);
      toast.success("Proje tekrar aktif edildi");
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch {
      toast.error("Proje aktifleştirilemedi");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `${project.project_code} · ${project.name} kalıcı olarak silinsin mi?\n\nBağlı paftalar, kablolar, dolaplar ve tüm ilerleme kayıtları da silinecek. Bu işlem geri alınamaz.`
    );
    if (!confirmed) return;
    setLoading(true);
    try {
      await new ProjectRepository(createClient()).delete(project.id);
      toast.success("Proje kalıcı olarak silindi");
      router.push("/projects");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Proje silinemedi");
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    ...(isBfOrGf
      ? [
          { label: "Pafta Sayısı", value: project.sheet_count ?? "—" },
          { label: "HP Bilgisi", value: project.hp_count ?? "—" },
          { label: "Pafta Yapısı", value: project.is_single_sheet ? "Tek pafta" : "Çoklu pafta" },
        ]
      : []),
    { label: "Proje ID", value: project.project_code },
    { label: "Proje Türü", value: typeLabel },
    ...(isHpFocused
      ? [{ label: "Pafta Bazlı İlerleme", value: `%${project.progress_percent ?? 0}` }]
      : [
          { label: "Mevki", value: project.location },
          { label: "Alınan Tarih", value: formatDate(project.received_at) },
        ]),
    ...(isCorporateStyleProject(project.project_type)
      ? [
          { label: "Toplam Proje Tarihi", value: formatDate(project.project_date) },
          { label: "Öncelik Sırası", value: project.priority_order ?? "—" },
        ]
      : []),
    {
      label: "Bitiş Tarihi",
      value: project.completed_at
        ? formatDate(project.completed_at)
        : "Arşive aktarılınca işlenir",
    },
    { label: "Oluşturulma", value: formatDateTime(project.created_at) },
    { label: "Güncelleme", value: formatDateTime(project.updated_at) },
    {
      label: "Arşiv",
      value: project.is_archived
        ? `Evet (${formatDateTime(project.archived_at)})`
        : "Hayır",
    },
    { label: "Bitiren Ekip Başı", value: project.completed_by_name ?? "—" },
    ...(project.is_cancelled
      ? [
          { label: "İptal Tarihi", value: formatDateTime(project.cancelled_at) },
          { label: "İptal Sebebi", value: project.cancellation_reason ?? "—" },
        ]
      : []),
    ...(project.status === "in_progress"
      ? [{ label: "Mevcut Ekip Başı", value: project.current_team_leader_name ?? "—" }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div
          className={
            isOngoing
              ? "space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-800 dark:bg-amber-950/35"
              : "space-y-2"
          }
        >
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">
              {project.name}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground">{project.project_code}</p>
          <ProjectStatusIndicators project={project} />
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && !project.is_archived && !project.is_cancelled && (
            <Button asChild variant="outline">
              <Link href={`/projects/${project.id}/edit`}>
                <Pencil className="h-4 w-4" />
                Düzenle
              </Link>
            </Button>
          )}
          {!readOnly && project.is_cancelled && !project.is_archived && (
            <Button onClick={handleReactivate} disabled={loading}>
              {loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <ArchiveRestore className="h-4 w-4" />
              )}
              Tekrar Aktif Et
            </Button>
          )}
          {!readOnly && canCancel && (
            <Button variant="destructive" onClick={() => setCancelOpen(true)} disabled={loading}>
              <Ban className="h-4 w-4" />
              Projeyi İptal Et
            </Button>
          )}
          {!readOnly && (
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Projeyi Sil
            </Button>
          )}
        </div>
      </div>

      {project.is_cancelled && <Card className="border-rose-300 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"><CardHeader><CardTitle className="text-base text-rose-700 dark:text-rose-300">İptal Bilgileri</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><div><span className="font-medium">İptal sebebi:</span> <span className="whitespace-pre-wrap">{project.cancellation_reason}</span></div><div><span className="font-medium">İptal tarihi:</span> {formatDateTime(project.cancelled_at)}</div><div><span className="font-medium">İptal öncesi ekip:</span> {project.current_team_leader_name || "Ekip ataması bulunmuyor"}</div><div><span className="font-medium">Kayıtlı işlem:</span> {progressCount > 0 ? `${progressCount} ilerleme kaydı korunuyor` : "İlerleme kaydı bulunmuyor"}</div></CardContent></Card>}

      {Boolean(project.cancellation_history?.length) && <Card><CardHeader><CardTitle className="text-base">İptal Geçmişi</CardTitle></CardHeader><CardContent className="space-y-3">{[...(project.cancellation_history ?? [])].sort((a, b) => b.cancelled_at.localeCompare(a.cancelled_at)).map((history) => <div key={history.id} className="rounded-lg border p-4 text-sm"><p className="whitespace-pre-wrap"><span className="font-medium">İptal sebebi:</span> {history.reason}</p><div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground"><span>İptal edildi: {formatDateTime(history.cancelled_at)}</span><span>{history.reactivated_at ? `Yeniden aktif edildi: ${formatDateTime(history.reactivated_at)}` : "Proje halen iptal durumunda"}</span></div></div>)}</CardContent></Card>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Proje Bilgileri</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label} className="space-y-1">
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                    {field.label}
                  </dt>
                  <dd className="text-sm font-medium">{field.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Açıklama</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {project.description?.trim() || "Açıklama girilmemiş."}
            </p>
          </CardContent>
        </Card>
      </div>

      {!isHpFocused && <Card>
        <CardHeader>
          <CardTitle className="text-base">Proje Görseli</CardTitle>
        </CardHeader>
        <CardContent>
          {project.image_url ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => { setImageLoadFailed(false); setImageOpen(true); }}>
                <Eye className="h-4 w-4" />
                Göster
              </Button>
              <Button variant="outline" onClick={handleCopyImageUrl}>
                <Copy className="h-4 w-4" />
                URL Kopyala
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Görsel URL eklenmemiş.</p>
          )}
        </CardContent>
      </Card>}

      {!isHpFocused && <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-[90vw] overflow-y-auto p-4 sm:p-6 [&>button]:flex [&>button]:h-10 [&>button]:w-10 [&>button]:items-center [&>button]:justify-center">
          <DialogHeader>
            <DialogTitle>Proje Görseli</DialogTitle>
          </DialogHeader>
          {imageLoadFailed ? (
            <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">Görsel yüklenemedi.</div>
          ) : project.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={getDisplayImageUrl(project.image_url)} alt={`${project.name} proje görseli`} loading="lazy" referrerPolicy="no-referrer" className="mx-auto block max-h-[78vh] max-w-full object-contain" onError={() => setImageLoadFailed(true)} />
          ) : null}
        </DialogContent>
      </Dialog>}

      {!isHpFocused && <Card>
        <CardHeader>
          <CardTitle className="text-base">Aşama Tarihleri</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Alınan Tarih
              </dt>
              <dd className="text-sm font-medium">
                {formatDate(project.received_at)}
              </dd>
            </div>
            {PROJECT_STATUSES.map((stage) => (
              <div key={stage.value} className="space-y-1">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {"dateLabel" in stage && stage.dateLabel
                    ? stage.dateLabel
                    : `${stage.label} Tarihi`}
                </dt>
                <dd className="text-sm font-medium">
                  {formatDate(project[stage.dateKey])}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>}

      {project.project_type === "BGFD" ? <BgfdCabinetProgress project={project} cabinets={cabinets} personnel={personnel} readOnly={readOnly || project.is_archived || project.is_cancelled}/> : project.project_type === "HP_ODAKLI" ? <HpFocusedSheetManager project={project} sheets={sheets} personnel={personnel} readOnly={readOnly || project.is_archived || project.is_cancelled}/> : isCorporateStyleProject(project.project_type) ? null : <ProjectSheetProgress project={project} sheets={sheets} personnel={personnel} readOnly={readOnly || project.is_archived || project.is_cancelled} />}

      {project.project_type !== "BGFD" && project.project_type !== "HP_ODAKLI" && (isBfOrGf ||
        isOngoing ||
        project.cable_pulled !== null ||
        project.obk_pulled !== null ||
        project.joint_done !== null ||
        project.progress_notes) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isBfOrGf
                ? `${project.project_type} Proje Takibi`
                : "Devam Eden İş Adımları"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              {(!isBfOrGf || tracksObk) && (
              <div className="space-y-1">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  {isBfOrGf ? "OBK" : "Kablo"}
                </dt>
                <dd className="text-sm font-medium">
                  {formatBooleanChoice(
                    isBfOrGf
                      ? project.obk_pulled
                      : project.cable_pulled,
                    "Çekildi",
                    "Çekilmedi"
                  )}
                </dd>
              </div>
              )}
              <div className="space-y-1">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Ek
                </dt>
                <dd className="text-sm font-medium">
                  {formatBooleanChoice(
                    project.joint_done,
                    "Yapıldı",
                    "Yapılmadı"
                  )}
                </dd>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  İş Adımı Açıklaması
                </dt>
                <dd className="whitespace-pre-wrap text-sm font-medium text-muted-foreground">
                  {project.progress_notes?.trim() || "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}><DialogContent><DialogHeader><DialogTitle>Projeyi İptal Et</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">{project.project_code} · {project.name} aktif ve arşiv listelerinden kaldırılarak İptal Alanı&apos;na taşınacak. Geçmiş ekip ve işlem kayıtları korunacak.</p><div className="space-y-2"><Label htmlFor="cancellation-reason">İptal Sebebi</Label><Textarea id="cancellation-reason" value={cancellationReason} onChange={(event) => setCancellationReason(event.target.value)} placeholder="Projenin neden iptal edildiğini yazın..." rows={4} /></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setCancelOpen(false)}>Vazgeç</Button><Button variant="destructive" disabled={loading || cancellationReason.trim().length < 3} onClick={handleCancel}>{loading && <Loader2 className="animate-spin" />}İptal Et</Button></div></div></DialogContent></Dialog>
    </div>
  );
}
