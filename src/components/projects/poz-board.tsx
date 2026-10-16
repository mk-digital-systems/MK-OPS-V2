"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardList, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { HpSheet, ProjectProgressData } from "@/types/project";
import type { PozItem } from "@/types/poz";
import { formatQuantity, stageLabel } from "@/lib/constants/project";
import { normalizeNumberText } from "@/lib/bulk-import";
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

const toNumber = (value: string) => {
  const text = normalizeNumberText(value);
  return text ? Number(text) : null;
};

/**
 * Poz projesi: isteğe bağlı keşif (firma girer) ve imalatlardan gelen iş dökümü.
 * Keşif tamamlanınca proje kendiliğinden bitmez; proje sayfası "tamamlayalım mı?" diye sorar.
 */
export function PozBoard({
  projectId,
  pozes,
  data,
  sheets,
  readOnly,
}: {
  projectId: string;
  /** Projenin kataloğundaki pozlar (pasifler dahil) */
  pozes: PozItem[];
  data: ProjectProgressData;
  sheets: HpSheet[] | null;
  readOnly: boolean;
}) {
  // Yeni açılan projede (?kesif=1) keşif penceresi kendiliğinden açılır; girmek zorunlu değildir.
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!readOnly && new URLSearchParams(window.location.search).get("kesif") === "1") setEditing(true);
  }, [readOnly]);
  const pozById = useMemo(() => new Map(pozes.map((poz) => [poz.id, poz])), [pozes]);
  const sheetById = useMemo(() => new Map((sheets ?? []).map((sheet) => [sheet.id, sheet])), [sheets]);
  const rows = data.progress
    .filter((row) => !row.section_id)
    .map((row) => ({ row, poz: pozById.get(row.stage_id) }))
    .sort((a, b) => (a.poz?.sort_order ?? 0) - (b.poz?.sort_order ?? 0));
  const kesifRows = rows.filter(({ row }) => row.target_quantity !== null);
  const extraRows = rows.filter(({ row }) => row.target_quantity === null && Number(row.done_quantity) > 0);
  const kesifPercent = kesifRows.length ? kesifRows.reduce((sum, { row }) => sum + Number(row.percent), 0) / kesifRows.length : 0;
  const kesifDone = kesifRows.length > 0 && kesifRows.every(({ row }) => Number(row.done_quantity) >= Number(row.target_quantity));
  const rowById = useMemo(() => new Map(data.progress.map((row) => [row.id, row])), [data.progress]);
  const label = (stageId: string) => {
    const poz = pozById.get(stageId);
    return poz ? stageLabel(poz) : "—";
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
          <CardTitle className="flex-1 text-base">Keşif</CardTitle>
          {kesifRows.length > 0 &&
            (kesifDone ? (
              <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                Keşif tamamlandı
              </Badge>
            ) : (
              <Badge className="bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200">Keşif %{Math.round(kesifPercent)}</Badge>
            ))}
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <ClipboardList className="h-4 w-4" />
              {kesifRows.length ? "Keşfi düzenle" : "Keşif gir"}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {kesifRows.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">
              Keşif girilmedi. Keşif isteğe bağlıdır; girilirse imalatlarla ilerleme hesaplanır. Proje her durumda elle tamamlanır.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Kalem</th>
                    <th className="px-4 py-2.5 text-right font-medium">Keşif</th>
                    <th className="px-4 py-2.5 text-right font-medium">Yapılan</th>
                    <th className="px-4 py-2.5 text-right font-medium">Kalan</th>
                    <th className="w-36 px-4 py-2.5 font-medium">İlerleme</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {kesifRows.map(({ row, poz }) => {
                    const target = Number(row.target_quantity);
                    const done = Number(row.done_quantity);
                    const percent = target > 0 ? Math.min(100, (done / target) * 100) : 0;
                    return (
                      <tr key={row.id}>
                        <td className="px-4 py-2.5">{poz ? stageLabel(poz) : "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatQuantity(target, poz?.unit ?? null)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatQuantity(done, poz?.unit ?? null)}</td>
                        <td className={cn("px-4 py-2.5 text-right tabular-nums", done > target && "text-amber-700")}>
                          {done > target ? `+${formatQuantity(done - target, poz?.unit ?? null)} fazla` : formatQuantity(target - done, poz?.unit ?? null)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                              <div className={cn("h-full rounded-full", percent >= 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${percent}%` }} />
                            </div>
                            <span className="w-10 text-right text-xs tabular-nums">%{Math.round(percent)}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {extraRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Keşif dışı işler</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y text-sm">
              {extraRows.map(({ row, poz }) => (
                <li key={row.id} className="flex items-center justify-between gap-3 px-6 py-2.5">
                  <span>{poz ? stageLabel(poz) : "—"}</span>
                  <span className="tabular-nums">{formatQuantity(Number(row.done_quantity), poz?.unit ?? null)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">İmalat kayıtları</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.logs.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Henüz imalat girilmedi. İmalatlar sayfasından bu projeyi seçip poz girilir.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Tarih</th>
                    <th className="px-4 py-2.5 font-medium">Kalem</th>
                    <th className="px-4 py-2.5 text-right font-medium">Miktar</th>
                    <th className="px-4 py-2.5 font-medium">Ekip başı</th>
                    {sheets && <th className="px-4 py-2.5 font-medium">Pafta</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.logs.slice(0, 100).map((log) => {
                    const row = rowById.get(log.progress_id);
                    const poz = row ? pozById.get(row.stage_id) : undefined;
                    return (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap px-4 py-2.5">{formatDate(log.log_date)}</td>
                        <td className="px-4 py-2.5">{row ? label(row.stage_id) : "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{log.quantity === null ? "—" : formatQuantity(Number(log.quantity), poz?.unit ?? null)}</td>
                        <td className="px-4 py-2.5">{log.team_leader_name || "—"}</td>
                        {sheets && <td className="px-4 py-2.5">{log.sheet_id ? sheetById.get(log.sheet_id)?.sheet_no ?? "—" : "—"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <KesifDialog
          projectId={projectId}
          pozes={pozes}
          initial={kesifRows.map(({ row }) => ({ stageId: row.stage_id, quantity: String(Number(row.target_quantity)) }))}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

type KesifLine = { key: string; stageId: string; quantity: string };
const makeKey = () => Math.random().toString(36).slice(2);

function KesifDialog({
  projectId,
  pozes,
  initial,
  onClose,
}: {
  projectId: string;
  pozes: PozItem[];
  initial: { stageId: string; quantity: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<KesifLine[]>(() =>
    initial.length ? initial.map((line) => ({ ...line, key: makeKey() })) : [{ key: makeKey(), stageId: "", quantity: "" }]
  );
  const [saving, setSaving] = useState(false);
  const pozById = new Map(pozes.map((poz) => [poz.id, poz]));
  const selectable = pozes.filter((poz) => poz.is_active || initial.some((line) => line.stageId === poz.id));
  const groups = [...new Set(selectable.map((poz) => poz.group_name ?? ""))];
  const patch = (index: number, change: Partial<KesifLine>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...change } : line)));

  async function save() {
    const filled = lines.filter((line) => line.stageId);
    for (const line of filled) {
      const quantity = toNumber(line.quantity);
      if (quantity === null || Number.isNaN(quantity) || quantity <= 0) {
        toast.error(`${pozById.get(line.stageId)?.name ?? "Kalem"} için keşif miktarı girin`);
        return;
      }
    }
    if (new Set(filled.map((line) => line.stageId)).size !== filled.length) {
      toast.error("Aynı poz keşifte iki kez var");
      return;
    }
    setSaving(true);
    try {
      await new ProjectRepository(createClient()).saveKesif(
        projectId,
        filled.map((line) => ({ stage_id: line.stageId, quantity: toNumber(line.quantity)! }))
      );
      toast.success(filled.length ? "Keşif kaydedildi" : "Keşif kaldırıldı");
      onClose();
      router.refresh();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keşif</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Projede yapılacak işleri poz listesinden seçip miktarını girin. Keşif dışı işler imalatta yine girilebilir; keşif
          tamamlansa da proje elle tamamlanır.
        </p>
        {selectable.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Bu projenin kataloğunda poz yok. Poz Listesi sayfasından poz ekleyin.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden grid-cols-[minmax(0,1fr)_120px_60px_36px] gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
              <Label className="text-xs">Poz</Label>
              <Label className="text-xs">Miktar</Label>
              <span>Birim</span>
              <span />
            </div>
            {lines.map((line, index) => (
              <div key={line.key} className="grid grid-cols-[minmax(0,1fr)_100px_36px] gap-2 sm:grid-cols-[minmax(0,1fr)_120px_60px_36px] sm:items-center">
                <NativeSelect value={line.stageId} onChange={(event) => patch(index, { stageId: event.target.value })} className="col-span-3 sm:col-span-1">
                  <option value="">Poz seçin</option>
                  {groups.map((group) => (
                    <optgroup key={group || "-"} label={group || "Grupsuz"}>
                      {selectable
                        .filter((poz) => (poz.group_name ?? "") === group)
                        .map((poz) => (
                          <option key={poz.id} value={poz.id} disabled={lines.some((other, i) => i !== index && other.stageId === poz.id)}>
                            {stageLabel(poz)}
                            {poz.unit ? ` (${poz.unit})` : ""}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </NativeSelect>
                <Input value={line.quantity} onChange={(event) => patch(index, { quantity: event.target.value })} inputMode="decimal" placeholder="Miktar" />
                <span className="hidden text-sm text-muted-foreground sm:block">{pozById.get(line.stageId)?.unit ?? "—"}</span>
                <Button type="button" size="icon" variant="ghost" aria-label="Satırı kaldır" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, { key: makeKey(), stageId: "", quantity: "" }])}>
              <Plus className="h-4 w-4" />
              Satır ekle
            </Button>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Keşfi kaydet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
