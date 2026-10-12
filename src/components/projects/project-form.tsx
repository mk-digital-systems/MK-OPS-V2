"use client";

import { useState } from "react";
import { BranchSelectField, useBranches } from "@/components/layout/branch-provider";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ClipboardPaste, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Project, ProjectAddon, ProjectType } from "@/types/project";
import { projectSchema, type ProjectFormOutput, type ProjectFormValues } from "@/lib/validations/project";
import { createClient } from "@/lib/supabase/client";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HpSheetFields, emptyHpSheet, validateHpSheets } from "@/components/projects/hp-sheet-board";
import { StageListEditor, validateStageList, type StageListValue } from "@/components/projects/stage-list-editor";
import {
  CorporateStatusFields,
  saveCorporateStatus,
  validateCorporateStatus,
  type CorporateStatusValue,
} from "@/components/projects/corporate-status-panel";
import type { Personnel } from "@/types/work-plan";
import { todayISODate } from "@/lib/constants/project";

type Props = {
  mode: "create" | "edit";
  project?: Project;
  types: ProjectType[];
  locations: string[];
  /** Süper adminin açtığı proje eklentileri; kapalı eklentinin türleri yeni projede seçilemez. */
  addons?: ProjectAddon[];
  /** Kurumsal projede ekip başı seçimi için (yeni proje). */
  personnel?: Personnel[];
};

type SheetDraft = ReturnType<typeof emptyHpSheet>;
const MAX_SHEETS = 500;

export function ProjectForm({ mode, project, types: allTypes, locations, addons = [], personnel = [] }: Props) {
  const currentType = allTypes.find((type) => type.id === project?.project_type_id);
  // HP / kurumsal projenin türü değişmez; standart proje yalnızca standart türler arasında değişir.
  const types =
    mode === "edit"
      ? currentType && currentType.screen !== "standard"
        ? [currentType]
        : allTypes.filter((type) => type.screen === "standard")
      : allTypes.filter((type) => type.screen === "standard" || addons.includes(type.screen));
  const [sheets, setSheets] = useState<SheetDraft[]>(() => [emptyHpSheet()]);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [stageList, setStageList] = useState<StageListValue>({ mode: "template", items: [] });
  const [corporateStatus, setCorporateStatus] = useState<CorporateStatusValue>({ status: "not_started", leaderId: "", completedAt: todayISODate() });
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const { defaultBranchId } = useBranches();
  const [branchId, setBranchId] = useState(project?.branch_id ?? defaultBranchId ?? "");
  const form = useForm<ProjectFormValues, unknown, ProjectFormOutput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      project_code: project?.project_code ?? "",
      name: project?.name ?? "",
      project_type_id: project?.project_type_id ?? types[0]?.id ?? "",
      location: project?.location ?? "",
      team_name: project?.team_name ?? "",
      description: project?.description ?? "",
      image_url: project?.image_url ?? "",
      received_at: project?.received_at ?? "",
      start_date: project?.start_date ?? "",
      estimated_end_date: project?.estimated_end_date ?? "",
      priority_order: project?.priority_order?.toString() ?? "",
      project_date: project?.project_date ?? "",
    },
  });
  const errors = form.formState.errors;
  const selectedType = types.find((type) => type.id === form.watch("project_type_id"));
  const isHp = selectedType?.screen === "hp";
  const isCorporate = selectedType?.screen === "corporate";
  const typeLocked = mode === "edit" && (!!project?.has_activity || currentType?.screen !== "standard");

  function setSheetCount(value: number) {
    const count = Math.min(MAX_SHEETS, Math.max(1, Math.floor(value) || 1));
    setSheets((current) => Array.from({ length: count }, (_, index) => current[index] ?? emptyHpSheet()));
  }

  async function submit(values: ProjectFormOutput) {
    setSaving(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");
      const repository = new ProjectRepository(supabase);
      const payload = {
        ...values,
        priority_order: values.priority_order ? Number(values.priority_order) : null,
        // Toplam proje tarihi yalnızca kurumsal projede.
        project_date: isCorporate ? values.project_date : undefined,
        branch_id: branchId || undefined,
      };
      const corporateCreate = mode === "create" && isCorporate && corporateStatus.status !== "not_started";
      if (corporateCreate) {
        const problem = validateCorporateStatus(corporateStatus);
        if (problem) {
          toast.error(problem);
          return;
        }
      }
      let savedId: string;
      const customStages = mode === "create" && !isHp && stageList.mode === "custom";
      if (customStages) {
        const problem = validateStageList(stageList);
        if (problem) {
          toast.error(problem);
          return;
        }
      }
      if (mode === "create" && isHp) {
        const problem = validateHpSheets(sheets);
        if (problem) {
          toast.error(problem);
          return;
        }
        savedId = await repository.createHpProject(payload, sheets);
      } else {
        const saved =
          mode === "create" ? await repository.create(payload, user.id) : await repository.update(project!.id, payload, user.id);
        savedId = saved.id;
        if (corporateCreate) {
          // Durum kaydedilemezse proje "Başlamadı" olarak kalır; proje sayfasından değiştirilebilir.
          await saveCorporateStatus(repository, savedId, corporateStatus, personnel).catch((error: Error) =>
            toast.error("Proje oluşturuldu ama durumu kaydedilemedi", { description: error.message })
          );
        }
        if (customStages) {
          try {
            await repository.saveProjectStages(savedId, "custom", stageList.items);
          } catch (error) {
            // Kalem listesi kaydedilemezse yarım proje bırakılmaz.
            await repository.delete(savedId).catch(() => undefined);
            throw error;
          }
        }
      }
      toast.success(mode === "create" ? "Proje oluşturuldu" : "Proje güncellendi");
      router.push(`/panel/projects/${savedId}`);
      router.refresh();
    } catch (error) {
      const message = (error as { message?: string; code?: string })?.message ?? "";
      toast.error("Proje kaydedilemedi", {
        description: message.includes("projects_project_code_key")
          ? "Bu proje kodu zaten kullanılıyor."
          : message.includes("project_hp_sheets_no_unique")
            ? "Aynı pafta numarası bir projede birden fazla kullanılamaz."
            : message,
      });
    } finally {
      setSaving(false);
    }
  }

  if (types.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 p-8 text-center text-sm text-muted-foreground">
          <p>Proje oluşturmadan önce en az bir proje türü tanımlanmalı.</p>
          <Button asChild variant="outline">
            <Link href="/panel/projects/turler">Proje türlerini tanımla</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-6">
      <BranchSelectField value={branchId} onChange={setBranchId} />
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <Field label="Proje türü" error={errors.project_type_id?.message} className="sm:col-span-2">
            <NativeSelect
              {...form.register("project_type_id", { onChange: () => setStageList({ mode: "template", items: [] }) })}
              disabled={typeLocked}
            >
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </NativeSelect>
            {isHp && (
              <p className="text-xs text-muted-foreground">
                HP odaklı proje: paftalar ve HP adetleri aşağıda girilir; proje durumu paftalardan hesaplanır.
              </p>
            )}
            {isCorporate && (
              <p className="text-xs text-muted-foreground">Kurumsal proje: durum ve ekip başı elle seçilir; iş kalemi yoktur.</p>
            )}
            {selectedType?.catalog_type_id && selectedType.screen === "standard" && (
              <p className="text-xs text-muted-foreground">
                İş kalemleri imalatta Poz Listesi&apos;nden seçilir; keşfi proje sayfasından isteğe bağlı girebilirsiniz.
              </p>
            )}
            {mode === "edit" && selectedType && selectedType.screen === "standard" && !selectedType.catalog_type_id && (
              <p className="text-xs text-muted-foreground">
                {project?.stage_mode === "custom"
                  ? "İş kalemleri projeye göre düzenlenmiş; proje sayfasındaki “Kalemleri düzenle” ile değişir."
                  : `Aşamalar: ${selectedType.stages.map((stage) => stage.name).join(" → ")}`}
                {selectedType.has_sections && ` · ${selectedType.section_label} bazında takip`}
              </p>
            )}
            {typeLocked && (
              <p className="text-xs text-muted-foreground">
                {currentType?.screen === "standard"
                  ? "İş kaydı girilmiş projenin türü değiştirilemez."
                  : "Bu projenin türü değiştirilemez; paftalar proje sayfasından düzenlenir."}
              </p>
            )}
          </Field>
          <Field label="Proje kodu" error={errors.project_code?.message}>
            <Input {...form.register("project_code")} placeholder="Örn. PRJ-2026-014" />
          </Field>
          <Field label="Proje adı" error={errors.name?.message}>
            <Input {...form.register("name")} />
          </Field>
          <Field label={isCorporate ? "Lokasyon" : "Konum"} error={errors.location?.message}>
            <Input {...form.register("location")} list="project-locations" placeholder="İl, ilçe veya saha adı" />
            <datalist id="project-locations">
              {locations.map((location) => (
                <option key={location} value={location} />
              ))}
            </datalist>
          </Field>
          <Field label="Sorumlu ekip / firma (isteğe bağlı)" error={errors.team_name?.message}>
            <Input {...form.register("team_name")} />
          </Field>
          <Field label="Kabul tarihi" error={errors.received_at?.message}>
            <Input type="date" {...form.register("received_at")} />
          </Field>
          {isCorporate && (
            <Field label="Toplam proje tarihi" error={errors.project_date?.message}>
              <Input type="date" {...form.register("project_date")} />
            </Field>
          )}
          <Field label="Öncelik sırası (isteğe bağlı)" error={errors.priority_order?.message}>
            <Input type="number" min={1} {...form.register("priority_order")} placeholder="1 en yüksek" />
          </Field>
          <Field label="Planlanan başlangıç" error={errors.start_date?.message}>
            <Input type="date" {...form.register("start_date")} />
          </Field>
          <Field label="Planlanan bitiş" error={errors.estimated_end_date?.message}>
            <Input type="date" {...form.register("estimated_end_date")} />
            <p className="text-xs text-muted-foreground">Bu tarih geçerse proje otomatik olarak &quot;Gecikti&quot; olur.</p>
          </Field>
          <Field label="Görsel bağlantısı (isteğe bağlı)" error={errors.image_url?.message} className="sm:col-span-2">
            <Input {...form.register("image_url")} placeholder="https://…" />
          </Field>
          <Field label={isCorporate ? "Not" : "Açıklama"} error={errors.description?.message} className="sm:col-span-2">
            <Textarea rows={4} {...form.register("description")} />
          </Field>
        </CardContent>
      </Card>
      {mode === "create" && selectedType && selectedType.screen === "standard" && !selectedType.catalog_type_id && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <div>
              <Label>İş kalemleri</Label>
              {selectedType.has_sections && (
                <p className="mt-1 text-xs text-muted-foreground">Kalemler her {selectedType.section_label.toLocaleLowerCase("tr-TR")} için ayrı takip edilir.</p>
              )}
            </div>
            <StageListEditor templateStages={selectedType.stages} value={stageList} onChange={setStageList} />
          </CardContent>
        </Card>
      )}
      {mode === "create" && isCorporate && (
        <Card>
          <CardContent className="space-y-3 p-6">
            <Label>Başlangıç durumu</Label>
            <CorporateStatusFields value={corporateStatus} onChange={setCorporateStatus} personnel={personnel} />
          </CardContent>
        </Card>
      )}
      {mode === "create" && isHp && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="space-y-2">
                <Label>Pafta sayısı</Label>
                <Input
                  type="number"
                  min={1}
                  max={MAX_SHEETS}
                  inputMode="numeric"
                  className="w-32"
                  value={sheets.length}
                  onChange={(event) => setSheetCount(Number(event.target.value))}
                />
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Toplam {sheets.reduce((sum, sheet) => sum + sheet.hp_count, 0).toLocaleString("tr-TR")} HP
                </p>
                <Button type="button" variant="outline" onClick={() => setPasteOpen(true)}>
                  <ClipboardPaste className="h-4 w-4" />
                  Excel&apos;den yapıştır
                </Button>
              </div>
            </div>
            {sheets.map((sheet, index) => (
              <HpSheetFields
                key={sheet.key}
                sheet={sheet}
                title={sheets.length === 1 ? "Pafta bilgileri" : `Pafta ${index + 1}`}
                onChange={(patch) => setSheets((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))}
                onRemove={sheets.length > 1 ? () => setSheets((current) => current.filter((_, i) => i !== index)) : undefined}
              />
            ))}
          </CardContent>
        </Card>
      )}
      {pasteOpen && (
        <PasteSheetsDialog
          onClose={() => setPasteOpen(false)}
          onApply={(parsed) => {
            setSheets(parsed);
            setPasteOpen(false);
          }}
        />
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Vazgeç
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {mode === "create" ? "Projeyi Oluştur" : "Kaydet"}
        </Button>
      </div>
    </form>
  );
}

/** Excel'den kopyalanan satırlar: Pafta no · HP · Adres (sekme veya noktalı virgülle ayrılmış). */
function parseSheetRows(text: string): SheetDraft[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(line.includes("\t") ? "\t" : ";").map((cell) => cell.trim()))
    .filter((cells) => cells[0])
    // Başlık satırı (ör. "Pafta No | HP | Adres") atlanır.
    .filter((cells, index) => !(index === 0 && /pafta/i.test(cells[0]) && !/\d/.test(cells[1] ?? "")))
    .slice(0, MAX_SHEETS)
    .map((cells) => ({
      ...emptyHpSheet(),
      sheet_no: cells[0],
      hp_count: Math.max(0, Math.floor(Number((cells[1] ?? "").replace(/\./g, "").replace(",", ".")) || 0)),
      address: cells[2] ?? "",
    }));
}

function PasteSheetsDialog({ onClose, onApply }: { onClose: () => void; onApply: (sheets: SheetDraft[]) => void }) {
  const [text, setText] = useState("");
  const parsed = parseSheetRows(text);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Excel&apos;den pafta yapıştır</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Excel&apos;de sırasıyla <strong>Pafta no</strong>, <strong>HP</strong> ve <strong>Adres</strong> sütunlarını seçip kopyalayın ve
          buraya yapıştırın. Formdaki pafta listesi bununla değişir.
        </p>
        <Textarea
          rows={8}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={"P-101\t120\tAtatürk Cd. No:5\nP-102\t80\tİnönü Sk."}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          {parsed.length} pafta · {parsed.reduce((sum, sheet) => sum + sheet.hp_count, 0).toLocaleString("tr-TR")} HP
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="button" disabled={parsed.length === 0} onClick={() => onApply(parsed)}>
            Paftaları aktar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
