"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, LayoutTemplate, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { ProjectType } from "@/types/project";
import { PROJECT_TYPE_COLORS, PROJECT_TYPE_TEMPLATES, UNIT_SUGGESTIONS, type ProjectTypeTemplate } from "@/lib/constants/project";
import { projectTypeSchema, type ProjectTypeFormValues } from "@/lib/validations/project";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TypeDot } from "@/components/projects/project-status-indicators";

type Draft = ProjectTypeFormValues & { id: string | null };

const emptyDraft = (index: number): Draft => ({
  id: null,
  name: "",
  description: "",
  has_sections: false,
  section_label: "Bölüm",
  color: PROJECT_TYPE_COLORS[index % PROJECT_TYPE_COLORS.length],
  stages: [{ id: null, name: "", unit: "" }],
});

const fromTemplate = (template: ProjectTypeTemplate, index: number): Draft => ({
  id: null,
  name: template.name,
  description: template.description,
  has_sections: template.has_sections,
  section_label: template.section_label,
  color: PROJECT_TYPE_COLORS[index % PROJECT_TYPE_COLORS.length],
  stages: template.stages.map((stage) => ({ id: null, name: stage.name, unit: stage.unit ?? "" })),
});

const fromType = (type: ProjectType): Draft => ({
  id: type.id,
  name: type.name,
  description: type.description ?? "",
  has_sections: type.has_sections,
  section_label: type.section_label,
  color: type.color ?? "",
  stages: type.stages.map((stage) => ({ id: stage.id, name: stage.name, unit: stage.unit ?? "" })),
});

export function ProjectTypesManager({ types }: { types: ProjectType[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const repository = () => new ProjectRepository(createClient());

  async function toggleArchive(type: ProjectType) {
    setBusyId(type.id);
    try {
      await repository().setTypeArchived(type.id, !type.is_archived);
      toast.success(type.is_archived ? "Tür yeniden kullanıma açıldı" : "Tür arşivlendi; yeni projelerde görünmez");
      router.refresh();
    } catch (error) {
      toast.error("İşlem yapılamadı", { description: (error as Error)?.message });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(type: ProjectType) {
    if (!window.confirm(`${type.name} türü silinsin mi?`)) return;
    setBusyId(type.id);
    try {
      await repository().deleteType(type.id);
      toast.success("Tür silindi");
      router.refresh();
    } catch (error) {
      toast.error("Silinemedi", { description: (error as Error)?.message });
    } finally {
      setBusyId(null);
    }
  }

  const existingNames = new Set(types.map((type) => type.name.toLocaleLowerCase("tr-TR")));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Proje Türleri</CardTitle>
          <CardDescription>
            Firmanızın yaptığı iş türlerini ve her türün aşamalarını tanımlayın. Projeler bu aşamalara göre takip edilir.
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setTemplatesOpen(true)}>
            <LayoutTemplate className="h-4 w-4" />
            Şablondan ekle
          </Button>
          <Button onClick={() => setDraft(emptyDraft(types.length))}>
            <Plus className="h-4 w-4" />
            Yeni tür
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {types.length === 0 && (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Henüz proje türü yok. Hazır bir şablonla başlayabilir veya kendi türünüzü oluşturabilirsiniz.
          </div>
        )}
        {types.map((type) => (
          <div key={type.id} className={cn("rounded-xl border p-4", type.is_archived && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              <TypeDot color={type.color} />
              <p className="font-semibold">{type.name}</p>
              {type.has_sections && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{type.section_label} bazında</span>
              )}
              {type.is_archived && <span className="rounded-md bg-muted px-2 py-0.5 text-xs">Arşivde</span>}
              <div className="ml-auto flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => setDraft(fromType(type))} aria-label="Düzenle">
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => toggleArchive(type)} disabled={busyId === type.id} aria-label="Arşivle">
                  {type.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(type)} disabled={busyId === type.id} aria-label="Sil">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {type.description && <p className="mt-1 text-sm text-muted-foreground">{type.description}</p>}
            <ol className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {type.stages.map((stage, index) => (
                <li key={stage.id} className="rounded-full border bg-background px-2.5 py-1">
                  {index + 1}. {stage.name}
                  {stage.unit && <span className="text-muted-foreground"> ({stage.unit})</span>}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </CardContent>

      <Dialog open={templatesOpen} onOpenChange={setTemplatesOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Şablondan proje türü ekle</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Şablonu seçin; kaydetmeden önce aşamaları dilediğiniz gibi düzenleyebilirsiniz.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {PROJECT_TYPE_TEMPLATES.map((template, index) => {
              const exists = existingNames.has(template.name.toLocaleLowerCase("tr-TR"));
              return (
                <button
                  key={template.name}
                  type="button"
                  disabled={exists}
                  onClick={() => {
                    setTemplatesOpen(false);
                    setDraft(fromTemplate(template, types.length + index));
                  }}
                  className="rounded-xl border p-4 text-left transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <p className="font-semibold">{template.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{template.description}</p>
                  <p className="mt-2 text-xs">{template.stages.map((stage) => stage.name).join(" → ")}</p>
                  {exists && <p className="mt-2 text-xs font-medium">Zaten ekli</p>}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {draft && <TypeEditor draft={draft} onClose={() => setDraft(null)} />}
    </Card>
  );
}

function TypeEditor({ draft: initial, onClose }: { draft: Draft; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const setStage = (index: number, patch: Partial<Draft["stages"][number]>) =>
    set("stages", draft.stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)));
  const moveStage = (index: number, delta: number) => {
    const stages = [...draft.stages];
    const target = index + delta;
    if (target < 0 || target >= stages.length) return;
    [stages[index], stages[target]] = [stages[target], stages[index]];
    set("stages", stages);
  };

  async function save() {
    const parsed = projectTypeSchema.safeParse(draft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Bilgileri kontrol edin");
      return;
    }
    setSaving(true);
    try {
      await new ProjectRepository(createClient()).saveType({ ...parsed.data, id: draft.id });
      toast.success(draft.id ? "Proje türü güncellendi" : "Proje türü eklendi");
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
          <DialogTitle>{draft.id ? "Proje türünü düzenle" : "Yeni proje türü"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Tür adı</Label>
            <Input value={draft.name} onChange={(event) => set("name", event.target.value)} placeholder="Örn. Doğalgaz Hattı" />
          </div>
          <div className="space-y-2">
            <Label>Renk</Label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_TYPE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => set("color", color)}
                  className={cn("h-7 w-7 rounded-full border-2", draft.color === color ? "border-foreground" : "border-transparent")}
                  style={{ backgroundColor: color }}
                  aria-label={`Renk ${color}`}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Açıklama (isteğe bağlı)</Label>
            <Input value={draft.description} onChange={(event) => set("description", event.target.value)} />
          </div>
          <label className="flex items-start gap-3 rounded-xl border p-3 sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={draft.has_sections}
              onChange={(event) => set("has_sections", event.target.checked)}
            />
            <span className="space-y-1">
              <span className="block text-sm font-medium">Projeler bölümlere ayrılsın</span>
              <span className="block text-xs text-muted-foreground">
                Örn. bir sitedeki bloklar, bir hattın etapları. Aşamalar her bölüm için ayrı takip edilir.
              </span>
              {draft.has_sections && (
                <span className="flex items-center gap-2 pt-1">
                  <span className="text-xs">Bölümlerin adı:</span>
                  <Input
                    value={draft.section_label}
                    onChange={(event) => set("section_label", event.target.value)}
                    className="h-8 w-36"
                    placeholder="Blok, Etap, Hat…"
                  />
                </span>
              )}
            </span>
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Aşamalar (sırasıyla)</Label>
            <span className="text-xs text-muted-foreground">Birim girilirse metraj takip edilir</span>
          </div>
          <datalist id="stage-units">
            {UNIT_SUGGESTIONS.map((unit) => (
              <option key={unit} value={unit} />
            ))}
          </datalist>
          <ol className="space-y-2">
            {draft.stages.map((stage, index) => (
              <li key={stage.id ?? `new-${index}`} className="flex items-center gap-2">
                <span className="w-6 text-right text-sm text-muted-foreground">{index + 1}.</span>
                <Input
                  value={stage.name}
                  onChange={(event) => setStage(index, { name: event.target.value })}
                  placeholder="Aşama adı"
                  className="flex-1"
                />
                <Input
                  value={stage.unit}
                  onChange={(event) => setStage(index, { unit: event.target.value })}
                  placeholder="Birim"
                  list="stage-units"
                  className="w-24"
                />
                <Button type="button" size="icon" variant="ghost" onClick={() => moveStage(index, -1)} disabled={index === 0} aria-label="Yukarı">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => moveStage(index, 1)}
                  disabled={index === draft.stages.length - 1}
                  aria-label="Aşağı"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => set("stages", draft.stages.filter((_, i) => i !== index))}
                  disabled={draft.stages.length === 1}
                  aria-label="Aşamayı kaldır"
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ol>
          <Button type="button" variant="outline" size="sm" onClick={() => set("stages", [...draft.stages, { id: null, name: "", unit: "" }])}>
            <Plus className="h-4 w-4" />
            Aşama ekle
          </Button>
          {draft.id && (
            <p className="text-xs text-muted-foreground">
              Aşama eklemek mevcut projelere de yansır. İş kaydı girilmiş bir aşama silinemez.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Kaydet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
