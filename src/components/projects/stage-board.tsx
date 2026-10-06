"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ProjectProgressData, ProjectSection, ProjectType, StageLog, StageProgress } from "@/types/project";
import type { Personnel } from "@/types/work-plan";
import type { CurrencyCode } from "@/types/auth";
import type { ProjectPricing } from "@/types/hakedis";
import { formatMoney } from "@/lib/hakedis";
import { HakedisRepository } from "@/modules/hakedis/hakedis-repository";
import { STAGE_STATUSES, formatQuantity, todayISODate, type StageStatus } from "@/lib/constants/project";
import { cn, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ProgressBar } from "@/components/projects/project-status-indicators";

type Props = {
  projectId: string;
  type: ProjectType;
  data: ProjectProgressData;
  personnel: Personnel[];
  readOnly: boolean;
  /** Yalnızca hakediş yetkisi olanlara gelir. */
  pricing: ProjectPricing | null;
  currency: CurrencyCode;
};

const repository = () => new ProjectRepository(createClient());
const toNumber = (value: string) => Number(value.replace(",", "."));

export function StageBoard({ projectId, type, data, personnel, readOnly, pricing, currency }: Props) {
  const router = useRouter();
  const [sectionDialog, setSectionDialog] = useState<ProjectSection | "new" | null>(null);
  const [logTarget, setLogTarget] = useState<{ progress: StageProgress; title: string; unit: string | null } | null>(null);

  const stages = type.stages;
  const logsByProgress = useMemo(() => {
    const map = new Map<string, StageLog[]>();
    for (const log of data.logs) map.set(log.progress_id, [...(map.get(log.progress_id) ?? []), log]);
    return map;
  }, [data.logs]);
  const rowsFor = (sectionId: string | null) =>
    stages
      .map((stage) => ({
        stage,
        progress: data.progress.find((row) => row.stage_id === stage.id && row.section_id === sectionId),
      }))
      .filter((row): row is { stage: (typeof stages)[number]; progress: StageProgress } => !!row.progress);

  async function removeSection(section: ProjectSection) {
    if (!window.confirm(`${section.name} ve içindeki bütün iş kayıtları silinsin mi?`)) return;
    try {
      await repository().deleteSection(section.id);
      toast.success(`${type.section_label} silindi`);
      router.refresh();
    } catch (error) {
      toast.error("Silinemedi", { description: (error as Error)?.message });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">Aşamalar</h2>
        {type.has_sections && !readOnly && (
          <Button variant="outline" onClick={() => setSectionDialog("new")}>
            <Plus className="h-4 w-4" />
            {type.section_label} ekle
          </Button>
        )}
      </div>

      {stages.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">Bu proje türünde aşama tanımlı değil.</CardContent>
        </Card>
      )}

      {type.has_sections ? (
        data.sections.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Henüz {type.section_label.toLocaleLowerCase("tr-TR")} eklenmedi. Aşamalar her {type.section_label.toLocaleLowerCase("tr-TR")} için ayrı takip edilir.
            </CardContent>
          </Card>
        ) : (
          data.sections.map((section) => {
            const rows = rowsFor(section.id);
            const percent = rows.length ? rows.reduce((sum, row) => sum + Number(row.progress.percent), 0) / rows.length : 0;
            return (
              <Card key={section.id}>
                <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">{section.name}</CardTitle>
                    {(section.location || section.notes) && (
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        {section.location && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {section.location}
                          </span>
                        )}
                        {section.notes && <span>{section.notes}</span>}
                      </p>
                    )}
                  </div>
                  <ProgressBar value={percent} className="w-40" />
                  {!readOnly && (
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setSectionDialog(section)} aria-label="Düzenle">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => removeSection(section)} aria-label="Sil">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  <StageTable
                    rows={rows}
                    logsByProgress={logsByProgress}
                    readOnly={readOnly}
                    pricing={pricing}
                    currency={currency}
                    onAddLog={(progress, stageName, unit) => setLogTarget({ progress, title: `${section.name} · ${stageName}`, unit })}
                  />
                </CardContent>
              </Card>
            );
          })
        )
      ) : (
        stages.length > 0 && (
          <Card>
            <CardContent className="pt-6">
              <StageTable
                rows={rowsFor(null)}
                logsByProgress={logsByProgress}
                readOnly={readOnly}
                pricing={pricing}
                currency={currency}
                onAddLog={(progress, stageName, unit) => setLogTarget({ progress, title: stageName, unit })}
              />
            </CardContent>
          </Card>
        )
      )}

      {sectionDialog && (
        <SectionDialog
          projectId={projectId}
          label={type.section_label}
          section={sectionDialog === "new" ? null : sectionDialog}
          onClose={() => setSectionDialog(null)}
        />
      )}
      {logTarget && <LogDialog target={logTarget} personnel={personnel} onClose={() => setLogTarget(null)} />}
    </div>
  );
}

function StageTable({
  rows,
  logsByProgress,
  readOnly,
  pricing,
  currency,
  onAddLog,
}: {
  rows: { stage: ProjectType["stages"][number]; progress: StageProgress }[];
  logsByProgress: Map<string, StageLog[]>;
  readOnly: boolean;
  pricing: ProjectPricing | null;
  currency: CurrencyCode;
  onAddLog: (progress: StageProgress, stageName: string, unit: string | null) => void;
}) {
  return (
    <ol className="divide-y">
      {rows.map(({ stage, progress }, index) => (
        <StageRow
          key={progress.id}
          index={index + 1}
          name={stage.name}
          unit={stage.unit}
          progress={progress}
          logs={logsByProgress.get(progress.id) ?? []}
          readOnly={readOnly}
          pricing={pricing}
          currency={currency}
          stageId={stage.id}
          onAddLog={() => onAddLog(progress, stage.name, stage.unit)}
        />
      ))}
    </ol>
  );
}

function StageRow({
  index,
  name,
  unit,
  progress,
  logs,
  readOnly,
  pricing,
  currency,
  stageId,
  onAddLog,
}: {
  index: number;
  name: string;
  unit: string | null;
  progress: StageProgress;
  logs: StageLog[];
  readOnly: boolean;
  pricing: ProjectPricing | null;
  currency: CurrencyCode;
  stageId: string;
  onAddLog: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(progress.target_quantity?.toString() ?? "");
  const defaultPrice = pricing?.stagePrices[stageId];
  const projectPrice = pricing?.projectPrices[progress.id];
  const [price, setPrice] = useState(projectPrice !== undefined ? String(projectPrice) : "");
  const stageAmount = pricing ? logs.reduce((sum, log) => sum + (pricing.logValues[log.id]?.amount ?? 0), 0) : 0;
  const unpricedLogs = pricing ? logs.filter((log) => log.quantity !== null && !pricing.logValues[log.id]).length : 0;

  async function savePrice() {
    const value = price.trim() ? toNumber(price) : null;
    if (value !== null && !(value >= 0)) {
      toast.error("Birim fiyat geçersiz");
      return;
    }
    if (value === (projectPrice ?? null)) return;
    try {
      await new HakedisRepository(createClient()).setProjectStagePrice(progress.id, value);
      toast.success(value === null ? "Projeye özel fiyat kaldırıldı" : "Birim fiyat kaydedildi");
      router.refresh();
    } catch (error) {
      toast.error("Fiyat kaydedilemedi", { description: (error as Error)?.message });
    }
  }

  async function save(payload: { status?: StageStatus; target_quantity?: number | null }) {
    setSaving(true);
    try {
      await repository().updateStage(progress.id, payload);
      router.refresh();
    } catch (error) {
      toast.error("Aşama güncellenemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  function saveTarget() {
    const value = target.trim() ? toNumber(target) : null;
    if (value !== null && !(value > 0)) {
      toast.error("Hedef sıfırdan büyük olmalı");
      return;
    }
    if (value === (progress.target_quantity === null ? null : Number(progress.target_quantity))) return;
    void save({ target_quantity: value });
  }

  async function removeLog(log: StageLog) {
    if (!window.confirm("Bu iş kaydı silinsin mi?")) return;
    try {
      await repository().deleteLog(log.id);
      router.refresh();
    } catch (error) {
      toast.error("Kayıt silinemedi", { description: (error as Error)?.message });
    }
  }

  return (
    <li className="py-3">
      <div className="grid items-center gap-3 md:grid-cols-[1.4fr_150px_1fr_auto]">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              progress.status === "done" ? "bg-emerald-500 text-white" : progress.status === "in_progress" ? "bg-blue-500 text-white" : "bg-muted"
            )}
          >
            {index}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium">{name}</p>
            <p className="text-xs text-muted-foreground">
              {progress.completed_at
                ? `Tamamlandı: ${formatDate(progress.completed_at)}`
                : progress.started_at
                  ? `Başladı: ${formatDate(progress.started_at)}`
                  : "Başlamadı"}
            </p>
          </div>
        </div>
        <NativeSelect
          value={progress.status}
          disabled={readOnly || saving}
          onChange={(event) => save({ status: event.target.value as StageStatus })}
          aria-label={`${name} durumu`}
        >
          {STAGE_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </NativeSelect>
        <div className="space-y-1">
          {unit ? (
            <div className="flex items-center gap-2 text-sm">
              <span className="tabular-nums">{formatQuantity(progress.done_quantity)}</span>
              <span className="text-muted-foreground">/</span>
              {readOnly ? (
                <span>{formatQuantity(progress.target_quantity, unit)}</span>
              ) : (
                <Input
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  onBlur={saveTarget}
                  onKeyDown={(event) => event.key === "Enter" && (event.currentTarget as HTMLInputElement).blur()}
                  placeholder="Hedef"
                  inputMode="decimal"
                  className="h-8 w-24"
                />
              )}
              <span className="text-muted-foreground">{unit}</span>
            </div>
          ) : null}
          <ProgressBar value={Number(progress.percent)} />
        </div>
        <div className="flex gap-1">
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={onAddLog}>
              <Plus className="h-4 w-4" />
              Kayıt
            </Button>
          )}
          {logs.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
              {logs.length}
              <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
            </Button>
          )}
        </div>
      </div>
      {pricing && unit && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground md:ml-10">
          <span className="flex items-center gap-2">
            Birim fiyat
            <Input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              onBlur={savePrice}
              onKeyDown={(event) => event.key === "Enter" && (event.currentTarget as HTMLInputElement).blur()}
              placeholder={defaultPrice !== undefined ? String(defaultPrice) : "Fiyat yok"}
              disabled={readOnly}
              inputMode="decimal"
              className="h-7 w-24 text-xs"
            />
            / {unit}
            {projectPrice === undefined && defaultPrice !== undefined && <span>(varsayılan)</span>}
          </span>
          <span>
            Hakediş: <strong className="text-foreground">{formatMoney(stageAmount, currency)}</strong>
          </span>
          {unpricedLogs > 0 && <span className="text-amber-700">{unpricedLogs} kayıt fiyatsız</span>}
        </div>
      )}
      {open && logs.length > 0 && (
        <ul className="mt-3 space-y-1 rounded-lg bg-muted/40 p-2 text-sm md:ml-10">
          {logs.map((log) => (
            <li key={log.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1">
              <span className="w-24 shrink-0 text-muted-foreground">{formatDate(log.log_date)}</span>
              {log.quantity !== null && <span className="font-medium tabular-nums">{formatQuantity(log.quantity, unit)}</span>}
              {pricing?.logValues[log.id] && (
                <span className="tabular-nums text-muted-foreground">{formatMoney(pricing.logValues[log.id].amount, currency)}</span>
              )}
              {log.team_leader_name && <span>{log.team_leader_name}</span>}
              {log.notes && <span className="text-muted-foreground">{log.notes}</span>}
              {!readOnly && (
                <button type="button" onClick={() => removeLog(log)} className="ml-auto text-muted-foreground hover:text-destructive" aria-label="Kaydı sil">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function SectionDialog({
  projectId,
  label,
  section,
  onClose,
}: {
  projectId: string;
  label: string;
  section: ProjectSection | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(section?.name ?? "");
  const [location, setLocation] = useState(section?.location ?? "");
  const [notes, setNotes] = useState(section?.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error(`${label} adı zorunlu`);
      return;
    }
    setSaving(true);
    try {
      if (section) await repository().updateSection(section.id, { name, location, notes });
      else await repository().addSection(projectId, { name, location, notes });
      toast.success(section ? `${label} güncellendi` : `${label} eklendi`);
      onClose();
      router.refresh();
    } catch (error) {
      const message = (error as Error)?.message ?? "";
      toast.error("Kaydedilemedi", { description: message.includes("project_sections_name_unique") ? `Bu adla bir ${label.toLocaleLowerCase("tr-TR")} zaten var.` : message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{section ? `${label} düzenle` : `${label} ekle`}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Ad</Label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={`Örn. ${label} 1`} autoFocus />
          </div>
          <div className="space-y-2">
            <Label>Konum (isteğe bağlı)</Label>
            <Input value={location} onChange={(event) => setLocation(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Not (isteğe bağlı)</Label>
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function LogDialog({
  target,
  personnel,
  onClose,
}: {
  target: { progress: StageProgress; title: string; unit: string | null };
  personnel: Personnel[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [logDate, setLogDate] = useState(todayISODate());
  const [quantity, setQuantity] = useState("");
  const [leaderId, setLeaderId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const amount = quantity.trim() ? toNumber(quantity) : null;
    if (amount !== null && !(amount > 0)) {
      toast.error("Miktar sıfırdan büyük olmalı");
      return;
    }
    if (amount === null && !notes.trim() && !leaderId) {
      toast.error("Miktar, ekip veya not girin");
      return;
    }
    setSaving(true);
    try {
      const leader = personnel.find((person) => person.id === leaderId);
      await repository().addLog({
        progress_id: target.progress.id,
        log_date: logDate,
        quantity: amount,
        team_leader_personnel_id: leader?.id ?? null,
        team_leader_name: leader?.full_name ?? null,
        notes: notes.trim() || null,
      });
      toast.success("İş kaydı eklendi");
      onClose();
      router.refresh();
    } catch (error) {
      toast.error("Kayıt eklenemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>İş kaydı · {target.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tarih</Label>
              <Input type="date" value={logDate} onChange={(event) => setLogDate(event.target.value)} max={todayISODate()} />
            </div>
            {target.unit && (
              <div className="space-y-2">
                <Label>Yapılan miktar ({target.unit})</Label>
                <Input value={quantity} onChange={(event) => setQuantity(event.target.value)} inputMode="decimal" placeholder="0" />
              </div>
            )}
          </div>
          <div className="space-y-2">
            <Label>Ekip şefi / sorumlu</Label>
            <NativeSelect value={leaderId} onChange={(event) => setLeaderId(event.target.value)}>
              <option value="">Seçilmedi</option>
              {personnel.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>Not</Label>
            <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          {target.unit && target.progress.target_quantity && (
            <p className="text-xs text-muted-foreground">
              Hedef {formatQuantity(target.progress.target_quantity, target.unit)}; şu ana kadar{" "}
              {formatQuantity(target.progress.done_quantity, target.unit)} yapıldı. Hedefe ulaşınca aşama otomatik tamamlanır.
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Vazgeç
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
