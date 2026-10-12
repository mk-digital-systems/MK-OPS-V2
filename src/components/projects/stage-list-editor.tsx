"use client";

import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import type { ProjectTypeStage, StageListItem, StageMode } from "@/types/project";
import { UNIT_SUGGESTIONS, isValidPoz, stageLabel } from "@/lib/constants/project";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type StageListValue = { mode: StageMode; items: StageListItem[] };

const makeKey = () => Math.random().toString(36).slice(2);

/** Kayıtlı kalemlerden düzenleme satırları (şablon kalemi: project_id boş). */
export function toStageListItems(stages: ProjectTypeStage[]): StageListItem[] {
  return stages.map((stage) => ({
    key: stage.id,
    stage_id: stage.id,
    template: !stage.project_id,
    name: stage.name,
    unit: stage.unit ?? "",
    poz_code: stage.poz_code ?? "",
  }));
}

/** Kaydetmeden önce kontrol; hata metni döner. */
export function validateStageList(value: StageListValue): string | null {
  if (value.mode === "template") return null;
  if (value.items.length === 0) return "En az bir iş kalemi seçin";
  for (const [index, item] of value.items.entries()) {
    if (!item.name.trim()) return `${index + 1}. kalemin adı boş olamaz`;
    if (item.poz_code.trim() && !isValidPoz(item.poz_code))
      return `${item.name.trim() || `${index + 1}. kalem`}: poz 3–5 karakter olmalı`;
  }
  const names = value.items.map((item) => item.name.trim().toLocaleLowerCase("tr-TR"));
  const duplicateName = names.find((name, index) => names.indexOf(name) !== index);
  if (duplicateName) return `Aynı adla iki iş kalemi olamaz: ${duplicateName}`;
  const pozList = value.items.map((item) => item.poz_code.trim().toLocaleLowerCase("tr-TR")).filter(Boolean);
  const duplicatePoz = pozList.find((poz, index) => pozList.indexOf(poz) !== index);
  if (duplicatePoz) return `Aynı poz bir projede iki kalemde kullanılamaz: ${duplicatePoz.toLocaleUpperCase("tr-TR")}`;
  return null;
}

/**
 * Projenin iş kalemleri: şablondaki kalemlerin hepsi ya da projeye göre düzenlenmiş liste
 * (şablondan seçilenler + projeye özel kalemler, sıralı, isteğe bağlı poz).
 */
export function StageListEditor({
  templateStages,
  value,
  onChange,
  disabled = false,
}: {
  templateStages: ProjectTypeStage[];
  value: StageListValue;
  onChange: (value: StageListValue) => void;
  disabled?: boolean;
}) {
  const items = value.items;
  const setItems = (next: StageListItem[]) => onChange({ ...value, items: next });
  const patch = (index: number, change: Partial<StageListItem>) =>
    setItems(items.map((item, i) => (i === index ? { ...item, ...change } : item)));
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  };
  const missingTemplate = templateStages.filter((stage) => !items.some((item) => item.stage_id === stage.id));

  function setMode(mode: StageMode) {
    onChange({ mode, items: mode === "custom" && items.length === 0 ? toStageListItems(templateStages) : items });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <ModeOption
          active={value.mode === "template"}
          disabled={disabled}
          onClick={() => setMode("template")}
          title="Şablondaki kalemlerin hepsi"
          description={`Türün ${templateStages.length} kalemi gelir; şablona sonradan eklenen kalem bu projeye de gelir.`}
        />
        <ModeOption
          active={value.mode === "custom"}
          disabled={disabled}
          onClick={() => setMode("custom")}
          title="Projeye göre düzenle"
          description="Şablondan istediklerinizi seçin, projeye özel kalem ve poz ekleyin."
        />
      </div>

      {value.mode === "template" ? (
        <ol className="flex flex-wrap gap-1.5 text-xs">
          {templateStages.map((stage, index) => (
            <li key={stage.id} className="rounded-full border bg-background px-2.5 py-1">
              {index + 1}. {stageLabel(stage)}
              {stage.unit && <span className="text-muted-foreground"> ({stage.unit})</span>}
            </li>
          ))}
        </ol>
      ) : (
        <div className="space-y-2">
          <datalist id="stage-list-units">
            {UNIT_SUGGESTIONS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
          {items.length === 0 && <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">Kalem yok.</p>}
          <ol className="space-y-2">
            {items.map((item, index) => (
              <li key={item.key} className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2 sm:flex-nowrap">
                <span className="w-6 shrink-0 text-right text-sm text-muted-foreground">{index + 1}.</span>
                {item.template ? (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-sm font-medium">{stageLabel(item)}</span>
                    {item.unit && <span className="text-xs text-muted-foreground">({item.unit})</span>}
                    <span className="ml-auto shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Şablon</span>
                  </div>
                ) : (
                  <>
                    <Input
                      value={item.poz_code}
                      onChange={(event) => patch(index, { poz_code: event.target.value })}
                      placeholder="Poz"
                      maxLength={5}
                      disabled={disabled}
                      className="w-20"
                      aria-label="Poz"
                    />
                    <Input
                      value={item.name}
                      onChange={(event) => patch(index, { name: event.target.value })}
                      placeholder="Projeye özel kalem adı"
                      disabled={disabled}
                      className="min-w-40 flex-1"
                    />
                    <Input
                      value={item.unit}
                      onChange={(event) => patch(index, { unit: event.target.value })}
                      placeholder="Birim"
                      list="stage-list-units"
                      disabled={disabled}
                      className="w-20"
                    />
                  </>
                )}
                <div className="flex shrink-0">
                  <Button type="button" size="icon" variant="ghost" onClick={() => move(index, -1)} disabled={disabled || index === 0} aria-label="Yukarı">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => move(index, 1)} disabled={disabled || index === items.length - 1} aria-label="Aşağı">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => setItems(items.filter((_, i) => i !== index))}
                    disabled={disabled}
                    aria-label="Kalemi çıkar"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            {missingTemplate.length > 0 && (
              <NativeSelect
                value=""
                disabled={disabled}
                onChange={(event) => {
                  const stage = templateStages.find((item) => item.id === event.target.value);
                  if (stage) setItems([...items, ...toStageListItems([stage])]);
                }}
                className="w-auto"
                aria-label="Şablondan kalem ekle"
              >
                <option value="">Şablondan kalem ekle…</option>
                {missingTemplate.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stageLabel(stage)}
                  </option>
                ))}
              </NativeSelect>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setItems([...items, { key: makeKey(), stage_id: null, template: false, name: "", unit: "", poz_code: "" }])}
            >
              <Plus className="h-4 w-4" />
              Projeye özel kalem
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Poz isteğe bağlıdır ve elle girilir: 3–5 karakter, istenen biçimde; projede tekil olmalı. Şablon kalemlerinin pozu Proje
            Türleri sayfasından değişir.
          </p>
        </div>
      )}
    </div>
  );
}

function ModeOption({
  active,
  disabled,
  onClick,
  title,
  description,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-xl border p-3 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
        active && "border-primary ring-1 ring-primary"
      )}
      aria-pressed={active}
    >
      <span className="block text-sm font-medium">{title}</span>
      <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
    </button>
  );
}
