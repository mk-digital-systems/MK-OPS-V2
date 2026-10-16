"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import type { HpSheet, SheetKesifRow } from "@/types/project";
import type { PozItem } from "@/types/poz";
import { stageLabel } from "@/lib/constants/project";
import { normalizeNumberText } from "@/lib/bulk-import";
import { createClient } from "@/lib/supabase/client";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type KesifLine = { key: string; stageId: string; quantity: string };

export const newKesifLine = (): KesifLine => ({ key: Math.random().toString(36).slice(2), stageId: "", quantity: "" });

const toNumber = (value: string) => {
  const text = normalizeNumberText(value);
  return text ? Number(text) : null;
};

/** Boş satırlar atılır; eksik / geçersiz miktar ve aynı pozun iki kez girilmesi hata metni olarak döner. */
export function validateKesifLines(lines: KesifLine[], pozes: PozItem[], where = ""): string | null {
  const filled = lines.filter((line) => line.stageId);
  for (const line of filled) {
    const quantity = toNumber(line.quantity);
    if (quantity === null || Number.isNaN(quantity) || quantity <= 0) {
      return `${where}${pozes.find((poz) => poz.id === line.stageId)?.name ?? "Kalem"} için keşif miktarı girin`;
    }
  }
  if (new Set(filled.map((line) => line.stageId)).size !== filled.length) return `${where}Aynı poz keşifte iki kez var`;
  return null;
}

export const filledKesif = (lines: KesifLine[]) =>
  lines.filter((line) => line.stageId).map((line) => ({ stageId: line.stageId, quantity: toNumber(line.quantity)! }));

/** Bir paftanın (ya da projenin) keşif satırları: poz seçimi + miktar. */
export function KesifLinesEditor({
  pozes,
  lines,
  onChange,
  keepStageIds = [],
}: {
  pozes: PozItem[];
  lines: KesifLine[];
  onChange: (lines: KesifLine[]) => void;
  /** Pasif olsa da seçili kalacak pozlar */
  keepStageIds?: string[];
}) {
  const pozById = new Map(pozes.map((poz) => [poz.id, poz]));
  const selectable = pozes.filter((poz) => poz.is_active || keepStageIds.includes(poz.id) || lines.some((line) => line.stageId === poz.id));
  const groups = [...new Set(selectable.map((poz) => poz.group_name ?? ""))];
  const patch = (index: number, change: Partial<KesifLine>) => onChange(lines.map((line, i) => (i === index ? { ...line, ...change } : line)));

  return (
    <div className="space-y-2">
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
          <Button type="button" size="icon" variant="ghost" aria-label="Satırı kaldır" onClick={() => onChange(lines.filter((_, i) => i !== index))}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, newKesifLine()])}>
        <Plus className="h-4 w-4" />
        Satır ekle
      </Button>
    </div>
  );
}

/** HP projesinde her paftaya ayrı keşif: pafta başına poz + miktar. */
export function SheetKesifDialog({
  projectId,
  pozes,
  sheets,
  existing,
  onClose,
}: {
  projectId: string;
  pozes: PozItem[];
  sheets: HpSheet[];
  existing: SheetKesifRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const active = sheets.filter((sheet) => sheet.status !== "cancelled");
  const [bySheet, setBySheet] = useState<Record<string, KesifLine[]>>(() =>
    Object.fromEntries(
      active.map((sheet) => [
        sheet.id,
        existing.filter((row) => row.sheet_id === sheet.id).map((row) => ({ key: Math.random().toString(36).slice(2), stageId: row.stage_id, quantity: String(Number(row.target_quantity)) })),
      ])
    )
  );
  const [saving, setSaving] = useState(false);
  const [openSheet, setOpenSheet] = useState<string | null>(active[0]?.id ?? null);

  async function save() {
    for (const sheet of active) {
      const problem = validateKesifLines(bySheet[sheet.id] ?? [], pozes, `Pafta ${sheet.sheet_no}: `);
      if (problem) return toast.error(problem);
    }
    setSaving(true);
    try {
      await new ProjectRepository(createClient()).saveSheetKesif(
        projectId,
        active.flatMap((sheet) => filledKesif(bySheet[sheet.id] ?? []).map((line) => ({ sheet_id: sheet.id, ...line })))
      );
      toast.success("Pafta keşfi kaydedildi");
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pafta keşfi</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Her paftaya yapılacak işleri poz listesinden seçip miktarını girin. Keşif isteğe bağlıdır; girilmeyen paftalar keşifsiz
          ilerler. İmalatta pafta seçilirse yapılan iş o paftanın keşfinden düşer.
        </p>
        {pozes.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Bu projenin kataloğunda poz yok. Poz Listesi sayfasından poz ekleyin.
          </p>
        ) : active.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Önce pafta ekleyin.</p>
        ) : (
          <div className="space-y-2">
            {active.map((sheet) => {
              const lines = bySheet[sheet.id] ?? [];
              const open = openSheet === sheet.id;
              return (
                <div key={sheet.id} className="rounded-xl border">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setOpenSheet(open ? null : sheet.id)}
                  >
                    <span className="font-medium">Pafta {sheet.sheet_no}</span>
                    <span className="text-xs text-muted-foreground">{lines.filter((line) => line.stageId).length} kalem</span>
                  </button>
                  {open && (
                    <div className="border-t p-4">
                      <KesifLinesEditor
                        pozes={pozes}
                        lines={lines.length ? lines : [newKesifLine()]}
                        onChange={(next) => setBySheet((current) => ({ ...current, [sheet.id]: next }))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
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
