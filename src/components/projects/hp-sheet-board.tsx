"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Copy, Eye, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { HpSheet, HpSheetInput, HpSheetStatus } from "@/types/project";
import type { Personnel } from "@/types/work-plan";
import { HP_SHEET_STATUSES, getHpSheetStatusMeta, todayISODate } from "@/lib/constants/project";
import { getDisplayImageUrl } from "@/lib/project-image-url";
import { cn, formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const repository = () => new ProjectRepository(createClient());
const statusOrder = (status: HpSheetStatus) => HP_SHEET_STATUSES.findIndex((item) => item.value === status);
const formatHp = (value: number) => value.toLocaleString("tr-TR");
const isHttpUrl = (value: string) => !value.trim() || /^https?:\/\//i.test(value.trim());

export function sheetErrorMessage(error: unknown): string {
  const message = (error as Error)?.message ?? "";
  if (message.includes("project_hp_sheets_no_unique")) return "Bu pafta numarası projede zaten var.";
  return message;
}

/** HP odaklı projenin paftaları: özet, pafta durumu, ekip başı ve bitiş tarihi. */
export function HpSheetBoard({
  projectId,
  sheets,
  personnel,
  readOnly,
}: {
  projectId: string;
  sheets: HpSheet[];
  personnel: Personnel[];
  readOnly: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const sorted = [...sheets].sort(
    (a, b) => statusOrder(a.status) - statusOrder(b.status) || a.sort_order - b.sort_order || a.sheet_no.localeCompare(b.sheet_no, "tr")
  );
  const totalHp = sheets.reduce((sum, sheet) => sum + sheet.hp_count, 0);
  const completed = sheets.filter((sheet) => sheet.status === "completed");
  const completedHp = completed.reduce((sum, sheet) => sum + sheet.hp_count, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">Paftalar</CardTitle>
        {!readOnly && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
            Pafta ekle
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Summary label="Toplam pafta" value={sheets.length} />
          <Summary label="Biten pafta" value={completed.length} highlight />
          <Summary label="Kalan pafta" value={sheets.length - completed.length} />
          <Summary label="Toplam HP" value={totalHp} />
          <Summary label="Tamamlanan HP" value={completedHp} highlight />
          <Summary label="Kalan HP" value={Math.max(0, totalHp - completedHp)} />
        </div>

        {sheets.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Henüz pafta yok.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border">
            <div className="hidden grid-cols-[1fr_2fr_90px_150px_1fr_20px] gap-3 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
              <span>Pafta no</span>
              <span>Adres</span>
              <span>HP</span>
              <span>Durum</span>
              <span>Ekip başı</span>
              <span />
            </div>
            {sorted.map((sheet) => (
              <SheetRow key={sheet.id} sheet={sheet} personnel={personnel} readOnly={readOnly} />
            ))}
          </div>
        )}
      </CardContent>
      {adding && <AddSheetDialog projectId={projectId} nextOrder={sheets.length + 1} onClose={() => setAdding(false)} />}
    </Card>
  );
}

function Summary({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border p-3 sm:p-4",
        highlight ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40" : "bg-muted/30"
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums sm:text-2xl", highlight && "text-emerald-700 dark:text-emerald-300")}>
        {formatHp(value)}
      </p>
    </div>
  );
}

function SheetRow({ sheet, personnel, readOnly }: { sheet: HpSheet; personnel: Personnel[]; readOnly: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({
    sheet_no: sheet.sheet_no,
    hp_count: String(sheet.hp_count),
    address: sheet.address ?? "",
    image_url: sheet.image_url ?? "",
    notes: sheet.notes ?? "",
    status: sheet.status,
    leaderId: (sheet.status === "completed" ? sheet.completed_by_personnel_id : sheet.current_team_leader_personnel_id) ?? "",
    completed_at: sheet.completed_at ?? todayISODate(),
  });
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [imageOpen, setImageOpen] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));
  const meta = getHpSheetStatusMeta(sheet.status);
  const leaderName = sheet.status === "completed" ? sheet.completed_by_name : sheet.current_team_leader_name;
  const needsLeader = form.status === "in_progress" || form.status === "completed";

  async function save() {
    const hp = Number(form.hp_count || 0);
    if (!form.sheet_no.trim()) return toast.error("Pafta no zorunlu");
    if (!Number.isInteger(hp) || hp < 0) return toast.error("HP adedi 0 veya daha büyük bir tam sayı olmalı");
    if (!isHttpUrl(form.image_url)) return toast.error("Görsel bağlantısı http:// veya https:// ile başlamalı");
    if (form.status === "in_progress" && !form.leaderId) return toast.error("Devam eden paftanın ekip başını seçin");
    if (form.status === "completed" && !form.leaderId) return toast.error("Paftayı bitiren ekip başını seçin");
    if (form.status === "completed" && !form.completed_at) return toast.error("Bitiş tarihini girin");
    const leader = personnel.find((person) => person.id === form.leaderId);
    setBusy("save");
    try {
      await repository().updateHpSheet(sheet.id, {
        sheet_no: form.sheet_no,
        hp_count: hp,
        address: form.address,
        image_url: form.image_url,
        notes: form.notes,
        status: form.status,
        leader: needsLeader && leader ? { id: leader.id, name: leader.full_name } : null,
        completed_at: form.status === "completed" ? form.completed_at : null,
      });
      toast.success(`${form.sheet_no.trim()} kaydedildi`);
      router.refresh();
    } catch (error) {
      toast.error("Pafta kaydedilemedi", { description: sheetErrorMessage(error) });
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm(`${sheet.sheet_no} paftası silinsin mi?`)) return;
    setBusy("delete");
    try {
      await repository().deleteHpSheet(sheet.id);
      toast.success("Pafta silindi");
      router.refresh();
    } catch (error) {
      toast.error("Silinemedi", { description: (error as Error)?.message });
      setBusy(null);
    }
  }

  async function copyImageUrl() {
    try {
      await navigator.clipboard.writeText(form.image_url.trim());
      toast.success("Görsel bağlantısı kopyalandı");
    } catch {
      toast.error("Kopyalanamadı");
    }
  }

  return (
    <details className={cn("group border-b last:border-0", sheet.status === "completed" && "bg-emerald-50/60 dark:bg-emerald-950/20")}>
      <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] gap-x-3 gap-y-1 px-4 py-3 md:grid-cols-[1fr_2fr_90px_150px_1fr_20px] md:items-center">
        <strong className="truncate">{sheet.sheet_no}</strong>
        <span className="truncate text-sm text-muted-foreground max-md:col-span-2 max-md:row-start-2">{sheet.address || "—"}</span>
        <span className="text-sm font-semibold tabular-nums max-md:col-start-2 max-md:row-start-1">{formatHp(sheet.hp_count)} HP</span>
        <span className="max-md:row-start-3">
          <Badge className={meta.color}>{meta.label}</Badge>
        </span>
        <span className="truncate text-sm max-md:col-start-2 max-md:row-start-3 max-md:text-right">
          {leaderName || "—"}
          {sheet.status === "completed" && sheet.completed_at && (
            <span className="block text-xs text-muted-foreground">{formatDate(sheet.completed_at)}</span>
          )}
        </span>
        <ChevronDown className="hidden h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180 md:block" />
      </summary>

      <div className="grid gap-3 border-t bg-background p-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Pafta no</Label>
          <Input disabled={readOnly} value={form.sheet_no} onChange={(event) => set("sheet_no", event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>HP adedi</Label>
          <Input disabled={readOnly} type="number" min={0} inputMode="numeric" value={form.hp_count} onChange={(event) => set("hp_count", event.target.value)} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Adres</Label>
          <Input disabled={readOnly} value={form.address} onChange={(event) => set("address", event.target.value)} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label>Görsel bağlantısı</Label>
          <Input disabled={readOnly} type="url" placeholder="https://…" value={form.image_url} onChange={(event) => set("image_url", event.target.value)} />
          {form.image_url.trim() && isHttpUrl(form.image_url) && (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setImageOpen(true)}>
                <Eye className="h-4 w-4" />
                Göster
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={copyImageUrl}>
                <Copy className="h-4 w-4" />
                Bağlantıyı kopyala
              </Button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label>Durum</Label>
          <NativeSelect disabled={readOnly} value={form.status} onChange={(event) => set("status", event.target.value as HpSheetStatus)}>
            {HP_SHEET_STATUSES.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {needsLeader && (
          <div className="space-y-2">
            <Label>{form.status === "completed" ? "Bitiren ekip başı *" : "Mevcut ekip başı *"}</Label>
            <NativeSelect disabled={readOnly} value={form.leaderId} onChange={(event) => set("leaderId", event.target.value)}>
              <option value="">Ekip başı seçin</option>
              {personnel.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {form.status === "completed" && (
          <div className="space-y-2">
            <Label>Bitiş tarihi *</Label>
            <Input disabled={readOnly} type="date" value={form.completed_at} max={todayISODate()} onChange={(event) => set("completed_at", event.target.value)} />
            <p className="text-xs text-muted-foreground">HP raporları bu tarihe göre hesaplanır.</p>
          </div>
        )}
        <div className="space-y-2 md:col-span-2">
          <Label>Not</Label>
          <Textarea disabled={readOnly} rows={2} value={form.notes} onChange={(event) => set("notes", event.target.value)} />
        </div>
        {!readOnly && (
          <div className="flex flex-wrap justify-between gap-2 md:col-span-2">
            <Button type="button" variant="ghost" onClick={remove} disabled={busy !== null}>
              {busy === "delete" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Paftayı sil
            </Button>
            <Button type="button" onClick={save} disabled={busy !== null}>
              {busy === "save" && <Loader2 className="h-4 w-4 animate-spin" />}
              Paftayı kaydet
            </Button>
          </div>
        )}
      </div>

      <Dialog open={imageOpen} onOpenChange={setImageOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{sheet.sheet_no} görseli</DialogTitle>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={getDisplayImageUrl(form.image_url.trim())}
            alt={`${sheet.sheet_no} pafta görseli`}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="mx-auto max-h-[75vh] max-w-full object-contain"
          />
        </DialogContent>
      </Dialog>
    </details>
  );
}

export const emptyHpSheet = (): HpSheetInput & { key: string } => ({
  key: Math.random().toString(36).slice(2),
  sheet_no: "",
  hp_count: 0,
  address: "",
  image_url: "",
  notes: "",
});

/** Proje oluştururken ve sonradan pafta eklerken kullanılan alanlar. */
export function HpSheetFields({
  sheet,
  title,
  onChange,
  onRemove,
}: {
  sheet: HpSheetInput;
  title: string;
  onChange: (patch: Partial<HpSheetInput>) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl bg-muted/30 p-4 sm:grid-cols-2">
      <div className="flex items-center justify-between sm:col-span-2">
        <p className="font-medium">{title}</p>
        {onRemove && (
          <Button type="button" size="icon" variant="ghost" onClick={onRemove} aria-label={`${title} kaldır`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="space-y-2">
        <Label>Pafta no *</Label>
        <Input value={sheet.sheet_no} onChange={(event) => onChange({ sheet_no: event.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>HP adedi</Label>
        <Input
          type="number"
          min={0}
          inputMode="numeric"
          value={sheet.hp_count}
          onChange={(event) => onChange({ hp_count: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>Adres</Label>
        <Input value={sheet.address} onChange={(event) => onChange({ address: event.target.value })} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>Görsel bağlantısı</Label>
        <Input type="url" placeholder="https://…" value={sheet.image_url} onChange={(event) => onChange({ image_url: event.target.value })} />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label>Not</Label>
        <Textarea rows={2} value={sheet.notes} onChange={(event) => onChange({ notes: event.target.value })} />
      </div>
    </div>
  );
}

/** Pafta listesini kontrol eder; hata metni döner. */
export function validateHpSheets(sheets: HpSheetInput[]): string | null {
  if (sheets.length === 0) return "En az bir pafta girin";
  if (sheets.some((sheet) => !sheet.sheet_no.trim())) return "Her pafta için pafta numarası girin";
  const numbers = sheets.map((sheet) => sheet.sheet_no.trim().toLocaleLowerCase("tr-TR"));
  if (new Set(numbers).size !== numbers.length) return "Aynı pafta numarası bir projede birden fazla kullanılamaz";
  if (sheets.some((sheet) => !isHttpUrl(sheet.image_url))) return "Görsel bağlantısı http:// veya https:// ile başlamalı";
  return null;
}

function AddSheetDialog({ projectId, nextOrder, onClose }: { projectId: string; nextOrder: number; onClose: () => void }) {
  const router = useRouter();
  const [sheet, setSheet] = useState(emptyHpSheet);
  const [saving, setSaving] = useState(false);

  async function save() {
    const problem = validateHpSheets([sheet]);
    if (problem) return toast.error(problem);
    setSaving(true);
    try {
      await repository().addHpSheet(projectId, sheet, nextOrder);
      toast.success("Pafta eklendi");
      onClose();
      router.refresh();
    } catch (error) {
      toast.error("Pafta eklenemedi", { description: sheetErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Pafta ekle</DialogTitle>
        </DialogHeader>
        <HpSheetFields sheet={sheet} title="Pafta bilgileri" onChange={(patch) => setSheet((current) => ({ ...current, ...patch }))} />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Ekle
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
