"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Loader2,
  PauseCircle,
  Pencil,
  PlayCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Project, ProjectProgressData, ProjectStatus, ProjectType } from "@/types/project";
import type { Personnel } from "@/types/work-plan";
import type { CurrencyCode } from "@/types/auth";
import type { ProjectPricing } from "@/types/hakedis";
import { formatDate, formatDateTime } from "@/lib/utils";
import { getDisplayImageUrl } from "@/lib/project-image-url";
import { createClient } from "@/lib/supabase/client";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ProgressBar, ProjectStatusBadge, TypeDot } from "@/components/projects/project-status-indicators";
import { StageBoard } from "@/components/projects/stage-board";

type Props = {
  project: Project;
  type: ProjectType;
  progress: ProjectProgressData;
  personnel: Personnel[];
  readOnly: boolean;
  pricing: ProjectPricing | null;
  currency: CurrencyCode;
};

type Busy = "status" | "archive" | "cancel" | "reactivate" | "delete" | null;

export function ProjectDetail({ project, type, progress, personnel, readOnly, pricing, currency }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [reasonDialog, setReasonDialog] = useState<"hold" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const repository = () => new ProjectRepository(createClient());
  const editable = !readOnly && !project.is_archived && !project.is_cancelled;

  async function run(kind: Busy, action: () => Promise<unknown>, success: string, after?: () => void) {
    setBusy(kind);
    try {
      await action();
      toast.success(success);
      if (after) after();
      else router.refresh();
    } catch (error) {
      toast.error("İşlem yapılamadı", { description: (error as Error)?.message });
    } finally {
      setBusy(null);
    }
  }

  const setStatus = (status: ProjectStatus, holdReason?: string) =>
    run("status", () => repository().setStatus(project.id, status, holdReason), "Proje durumu güncellendi");

  async function submitReason() {
    if (reason.trim().length < 3) {
      toast.error("En az 3 karakter yazın");
      return;
    }
    if (reasonDialog === "hold") await setStatus("on_hold", reason);
    else await run("cancel", () => repository().cancel(project.id, reason), "Proje iptal edildi");
    setReasonDialog(null);
    setReason("");
  }

  function remove() {
    if (!window.confirm(`${project.name} ve bütün aşama kayıtları kalıcı olarak silinsin mi?`)) return;
    void run("delete", () => repository().delete(project.id), "Proje silindi", () => {
      router.push("/panel/projects");
      router.refresh();
    });
  }

  const info = [
    { label: "Proje kodu", value: project.project_code },
    { label: "Konum", value: project.location },
    { label: "Sorumlu ekip / firma", value: project.team_name || "—" },
    { label: "Son çalışan ekip", value: project.current_team_leader_name || "—" },
    { label: "Kabul tarihi", value: project.received_at ? formatDate(project.received_at) : "—" },
    { label: "Planlanan başlangıç", value: project.start_date ? formatDate(project.start_date) : "—" },
    { label: "Planlanan bitiş", value: project.estimated_end_date ? formatDate(project.estimated_end_date) : "—" },
    { label: "Tamamlanma", value: project.completed_at ? formatDate(project.completed_at) : "—" },
  ];

  return (
    <div className="space-y-6">
      <Link href="/panel/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Projeler
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
            <ProjectStatusBadge status={project.status} />
            {project.is_archived && <span className="rounded-md bg-muted px-2 py-0.5 text-xs">Arşivde</span>}
            {project.is_cancelled && <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs text-rose-700">İptal edildi</span>}
          </div>
          <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <TypeDot color={type.color} />
            {type.name} · {project.project_code}
          </p>
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {editable && (
              <Button asChild variant="outline">
                <Link href={`/panel/projects/${project.id}/edit`}>
                  <Pencil className="h-4 w-4" />
                  Düzenle
                </Link>
              </Button>
            )}
            {editable && project.status !== "on_hold" && project.status !== "completed" && (
              <Button variant="outline" onClick={() => setReasonDialog("hold")} disabled={busy !== null}>
                <PauseCircle className="h-4 w-4" />
                Beklemeye al
              </Button>
            )}
            {editable && project.status === "on_hold" && (
              <Button variant="outline" onClick={() => setStatus("in_progress")} disabled={busy !== null}>
                <PlayCircle className="h-4 w-4" />
                Devam ettir
              </Button>
            )}
            {editable && project.status !== "completed" && (
              <Button
                variant="outline"
                onClick={() => window.confirm("Proje, aşamaları tamamlanmamış olsa da tamamlandı olarak işaretlensin mi?") && setStatus("completed")}
                disabled={busy !== null}
              >
                <CheckCircle2 className="h-4 w-4" />
                Tamamlandı
              </Button>
            )}
            {editable && project.status === "completed" && (
              <Button variant="outline" onClick={() => setStatus("in_progress")} disabled={busy !== null}>
                <RotateCcw className="h-4 w-4" />
                Yeniden aç
              </Button>
            )}
            {!project.is_cancelled && (
              <Button
                variant="outline"
                onClick={() =>
                  run("archive", () => repository().setArchived(project.id, !project.is_archived), project.is_archived ? "Proje arşivden çıkarıldı" : "Proje arşivlendi")
                }
                disabled={busy !== null}
              >
                {busy === "archive" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : project.is_archived ? (
                  <ArchiveRestore className="h-4 w-4" />
                ) : (
                  <Archive className="h-4 w-4" />
                )}
                {project.is_archived ? "Arşivden çıkar" : "Arşivle"}
              </Button>
            )}
            {editable && project.status !== "completed" && (
              <Button variant="outline" onClick={() => setReasonDialog("cancel")} disabled={busy !== null}>
                <Ban className="h-4 w-4" />
                İptal et
              </Button>
            )}
            {project.is_cancelled && (
              <Button
                variant="outline"
                onClick={() => run("reactivate", () => repository().reactivate(project.id), "Proje yeniden aktif edildi")}
                disabled={busy !== null}
              >
                <RotateCcw className="h-4 w-4" />
                Yeniden aktif et
              </Button>
            )}
            <Button variant="ghost" size="icon" onClick={remove} disabled={busy !== null} aria-label="Projeyi sil">
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>

      {project.status === "on_hold" && project.hold_reason && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>Beklemede:</strong> {project.hold_reason}
        </div>
      )}
      {project.is_cancelled && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <strong>İptal nedeni:</strong> {project.cancellation_reason} · {formatDateTime(project.cancelled_at)}
        </div>
      )}

      <Card>
        <CardContent className="space-y-5 p-6">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium">Genel ilerleme</span>
              <span className="text-muted-foreground">
                {type.stages.length} aşama{type.has_sections ? ` · ${progress.sections.length} ${type.section_label.toLocaleLowerCase("tr-TR")}` : ""}
              </span>
            </div>
            <ProgressBar value={project.progress_percent} status={project.status} />
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            {info.map((item) => (
              <div key={item.label}>
                <dt className="text-xs text-muted-foreground">{item.label}</dt>
                <dd className="mt-0.5 font-medium">{item.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {(project.description || project.image_url) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Açıklama</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {project.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{project.description}</p>}
            {project.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={getDisplayImageUrl(project.image_url)}
                alt={`${project.name} görseli`}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="max-h-96 rounded-xl border object-contain"
              />
            )}
          </CardContent>
        </Card>
      )}

      <StageBoard
        projectId={project.id}
        type={type}
        data={progress}
        personnel={personnel}
        readOnly={!editable}
        pricing={pricing}
        currency={currency}
      />

      <Dialog open={reasonDialog !== null} onOpenChange={(open) => !open && setReasonDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reasonDialog === "hold" ? "Projeyi beklemeye al" : "Projeyi iptal et"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{reasonDialog === "hold" ? "Bekleme nedeni" : "İptal nedeni"}</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonDialog === "hold" ? "Örn. izin bekleniyor, malzeme bekleniyor…" : "Neden iptal edildiğini yazın"}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReasonDialog(null)}>
              Vazgeç
            </Button>
            <Button variant={reasonDialog === "cancel" ? "destructive" : "default"} onClick={submitReason} disabled={busy !== null}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {reasonDialog === "hold" ? "Beklemeye al" : "İptal et"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
