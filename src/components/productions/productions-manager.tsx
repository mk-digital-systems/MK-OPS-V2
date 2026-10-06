"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardList, FileDown, Loader2, MessageCircle, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Personnel } from "@/types/work-plan";
import type { ProductionEntry, ProductionItemKind, ProductionProjectOption, ProductionSaveJob, ProductionTarget } from "@/types/production";
import type { ProjectType } from "@/types/project";
import type { CurrencyCode } from "@/types/auth";
import { formatMoney } from "@/lib/hakedis";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { ProductionRepository } from "@/modules/productions/production-repository";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { downloadProductionHistoryPdf, saveAndShareDailyProduction } from "@/lib/production-pdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CompanyLogo, useReportBrand } from "@/components/layout/company-brand-provider";

/** stage: projenin iş kalemi (projeye iş kaydı açar); extra: fiyatlı ek iş; note: eski serbest metin */
type FormLine = { key: string; itemId: string | null; kind: ProductionItemKind; progressId: string; description: string; quantity: string; unit: string; unitPrice: string };
/** projectId boşsa listede olmayan (serbest) iş */
type FormJob = { key: string; projectId: string; title: string; workId: string; lines: FormLine[] };
type FormTeam = { key: string; entryId: string | null; personnelId: string; jobs: FormJob[] };

const accents = [
  { border: "border-l-blue-600", jobBorder: "border-blue-600", soft: "bg-blue-50/60 dark:bg-blue-950/20", label: "text-blue-700 dark:text-blue-300" },
  { border: "border-l-emerald-600", jobBorder: "border-emerald-600", soft: "bg-emerald-50/60 dark:bg-emerald-950/20", label: "text-emerald-700 dark:text-emerald-300" },
  { border: "border-l-amber-600", jobBorder: "border-amber-600", soft: "bg-amber-50/60 dark:bg-amber-950/20", label: "text-amber-700 dark:text-amber-300" },
  { border: "border-l-rose-600", jobBorder: "border-rose-600", soft: "bg-rose-50/60 dark:bg-rose-950/20", label: "text-rose-700 dark:text-rose-300" },
  { border: "border-l-cyan-600", jobBorder: "border-cyan-600", soft: "bg-cyan-50/60 dark:bg-cyan-950/20", label: "text-cyan-700 dark:text-cyan-300" },
];

const FREE_JOB = "__free__";
const makeKey = () => crypto.randomUUID();
const newLine = (kind: ProductionItemKind): FormLine => ({ key: makeKey(), itemId: null, kind, progressId: "", description: "", quantity: kind === "extra" ? "1" : "", unit: "", unitPrice: "" });
const newJob = (): FormJob => ({ key: makeKey(), projectId: "", title: "", workId: "", lines: [newLine("extra")] });
const toNumber = (value: string) => {
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
};
const newTeam = (): FormTeam => ({ key: makeKey(), entryId: null, personnelId: "", jobs: [newJob()] });
const isEmptyTeam = (team: FormTeam) => !team.entryId && !team.personnelId && team.jobs.every((job) =>
  !job.projectId && !job.title.trim() && !job.workId.trim() && job.lines.every((line) => !line.description.trim() && !line.progressId));
const normalize = (value: string | null | undefined) => (value ?? "").trim().toLocaleLowerCase("tr-TR");

function entriesToTeams(entries: ProductionEntry[], prices: Record<string, number>): FormTeam[] {
  return entries.map((entry) => ({
    key: entry.id,
    entryId: entry.id,
    personnelId: entry.team_leader_personnel_id,
    jobs: entry.jobs.map((job) => ({
      key: job.id,
      projectId: job.project_id ?? "",
      title: job.project_name_snapshot,
      workId: job.project_code_snapshot || (job.source === "manual" ? "" : job.project_name_snapshot),
      lines: job.items.map((item): FormLine => {
        // Projesi silinmiş iş kalemi satırı ek iş olarak açılır.
        const kind: ProductionItemKind = item.kind === "stage" && !(item.progress_id && job.project_id) ? "extra" : item.kind ?? "note";
        return {
          key: item.id,
          itemId: item.id,
          kind,
          progressId: item.progress_id ?? "",
          description: kind === "note" ? legacyDescription(item.item_name_snapshot, item.quantity, item.unit_snapshot) : item.item_name_snapshot,
          quantity: kind === "note" ? "" : String(Number(item.quantity)),
          unit: kind === "note" ? "" : item.unit_snapshot,
          unitPrice: prices[item.id] !== undefined ? String(prices[item.id]) : "",
        };
      }),
    })),
  })).map((team) => ({ ...team, jobs: team.jobs.length ? team.jobs : [newJob()] }));
}

function legacyDescription(name: string, quantity: number, unit: string) {
  if (unit === "SATIR" && Number(quantity) === 1) return name;
  return `${name} — ${Number(quantity).toLocaleString("tr-TR")} ${unit}`;
}

export function ProductionsManager({ initialDate, personnel, initialEntries, readOnly, projects, projectTypes, canSeePrices, initialExtraPrices, currency }: {
  initialDate: string;
  personnel: Personnel[];
  initialEntries: ProductionEntry[];
  readOnly: boolean;
  projects: ProductionProjectOption[];
  projectTypes: ProjectType[];
  /** Hakediş yetkisi: ek iş fiyatını görür ve girer */
  canSeePrices: boolean;
  initialExtraPrices: Record<string, number>;
  currency: CurrencyCode;
}) {
  const brand = useReportBrand();
  const initialDailyEntries = initialEntries.filter((entry) => entry.work_date === initialDate);
  const [date, setDate] = useState(initialDate);
  const [dailyEntries, setDailyEntries] = useState(initialDailyEntries);
  const [teams, setTeams] = useState<FormTeam[]>(() => entriesToTeams(initialDailyEntries, initialExtraPrices).length ? entriesToTeams(initialDailyEntries, initialExtraPrices) : [newTeam()]);
  const [targets, setTargets] = useState<Record<string, ProductionTarget[]>>({});
  const [removedEntryIds, setRemovedEntryIds] = useState<string[]>([]);
  const [reportEntries, setReportEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const month = initialDate.slice(0, 7);
  const [from, setFrom] = useState(`${month}-01`);
  const [to, setTo] = useState(`${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, "0")}`);
  const [personnelFilter, setPersonnelFilter] = useState("all");
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  const [appliedRange, setAppliedRange] = useState({ from: `${month}-01`, to: `${month}-${String(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate()).padStart(2, "0")}` });

  const activePersonnel = useMemo(() => personnel.filter((person) => person.is_active).sort((a, b) => a.full_name.localeCompare(b.full_name, "tr")), [personnel]);
  const personnelById = useMemo(() => new Map(personnel.map((person) => [person.id, person])), [personnel]);
  const filteredReport = useMemo(
    () => reportEntries.filter((entry) => personnelFilter === "all" || entry.team_leader_personnel_id === personnelFilter),
    [reportEntries, personnelFilter],
  );
  const selectedHistoryEntries = selectedHistoryDate
    ? filteredReport.filter((entry) => entry.work_date === selectedHistoryDate)
    : [];
  const reportPersonnel = [...new Map([
    ...personnel.map((person) => [person.id, person.full_name] as const),
    ...reportEntries.map((entry) => [entry.team_leader_personnel_id, entry.team_leader_name_snapshot] as const),
  ]).entries()].sort((a, b) => a[1].localeCompare(b[1], "tr"));
  const groupedReport = useMemo(() => {
    const groups = new Map<string, ProductionEntry[]>();
    for (const entry of filteredReport) groups.set(entry.work_date, [...(groups.get(entry.work_date) ?? []), entry]);
    return [...groups.entries()].sort(([dateA], [dateB]) => dateB.localeCompare(dateA));
  }, [filteredReport]);

  // Seçili projelerin iş kalemlerini yükle
  const selectedProjectIds = [...new Set(teams.flatMap((team) => team.jobs.map((job) => job.projectId).filter(Boolean)))].join(",");
  useEffect(() => {
    const missing = selectedProjectIds.split(",").filter((id) => id && !targets[id]);
    if (!missing.length) return;
    const repository = new ProductionRepository(createClient());
    void Promise.all(missing.map(async (id) => [id, await repository.listTargets(id, projectTypes)] as const))
      .then((loaded) => setTargets((current) => ({ ...current, ...Object.fromEntries(loaded) })))
      .catch(() => toast.error("Projenin iş kalemleri yüklenemedi"));
  }, [selectedProjectIds, targets, projectTypes]);

  async function loadPrices(entries: ProductionEntry[]) {
    if (!canSeePrices) return {};
    return new ProductionRepository(createClient()).getExtraPrices(
      entries.flatMap((entry) => entry.jobs.flatMap((job) => job.items.filter((item) => item.kind === "extra").map((item) => item.id)))
    );
  }

  /** O günün iş planındaki ekipleri (ekip şefi + proje) forma ekler; kullanıcı yalnızca miktarları girer. */
  async function fillFromWorkPlan() {
    setLoading(true);
    try {
      const plan = await new WorkPlanRepository(createClient()).getByDate(date);
      if (!plan?.teams.length) return void toast.info(`${formatDate(date)} için kayıtlı iş planı yok`);
      const used = new Set(teams.map((team) => team.personnelId).filter(Boolean));
      const added: FormTeam[] = [];
      let skipped = 0;
      for (const planTeam of plan.teams) {
        const chiefId = planTeam.chief_personnel_id;
        if (!chiefId || !personnelById.has(chiefId)) { skipped++; continue; }
        if (used.has(chiefId) && !added.some((team) => team.personnelId === chiefId)) continue;
        const code = normalize(planTeam.project_code);
        const project = (code && code !== "-" ? projects.find((item) => normalize(item.project_code) === code) : undefined)
          ?? projects.find((item) => normalize(item.name) === normalize(planTeam.project_name));
        const job: FormJob = project
          ? { key: makeKey(), projectId: project.id, title: project.name, workId: project.project_code, lines: [newLine("stage")] }
          : { key: makeKey(), projectId: "", title: planTeam.project_name, workId: planTeam.project_code === "-" ? "" : planTeam.project_code, lines: [newLine("extra")] };
        const existing = added.find((team) => team.personnelId === chiefId);
        if (existing) existing.jobs.push(job);
        else added.push({ key: makeKey(), entryId: null, personnelId: chiefId, jobs: [job] });
        used.add(chiefId);
      }
      if (!added.length) {
        return void toast.info(skipped ? "İş planındaki ekip şefleri aktif personel listesinde bulunamadı" : "İş planındaki ekipler zaten formda");
      }
      setTeams((current) => [...current.filter((team) => !isEmptyTeam(team)), ...added]);
      toast.success(`${added.length} ekip iş planından eklendi; miktarları girip kaydedin`);
    } catch (error) {
      toast.error("İş planı okunamadı", { description: (error as Error)?.message });
    } finally {
      setLoading(false);
    }
  }

  function selectProject(teamIndex: number, jobIndex: number, projectId: string) {
    const job = teams[teamIndex].jobs[jobIndex];
    if (job.projectId === projectId) return;
    // Başka projeye geçince eski projenin iş kalemi satırları geçersiz olur.
    const kept = job.lines.filter((line) => line.kind !== "stage" && (line.kind !== "extra" || line.description.trim() || line.unitPrice.trim()));
    const project = projects.find((item) => item.id === projectId);
    updateJob(teamIndex, jobIndex, {
      projectId,
      title: project ? project.name : job.projectId ? "" : job.title,
      workId: project ? project.project_code : job.projectId ? "" : job.workId,
      lines: kept.length ? (projectId ? [newLine("stage"), ...kept] : kept) : [newLine(projectId ? "stage" : "extra")],
    });
  }

  async function changeDate(nextDate: string) {
    setDate(nextDate);
    setLoading(true);
    try {
      const entries = await new ProductionRepository(createClient()).listEntries(nextDate, nextDate);
      setDailyEntries(entries);
      const loadedTeams = entriesToTeams(entries, await loadPrices(entries));
      setTeams(loadedTeams.length ? loadedTeams : [newTeam()]);
      setRemovedEntryIds([]);
    } catch (error) {
      console.error(error);
      toast.error("Günlük imalatlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  function updateTeam(teamIndex: number, patch: Partial<FormTeam>) {
    setTeams((current) => current.map((team, index) => index === teamIndex ? { ...team, ...patch } : team));
  }

  function updateJob(teamIndex: number, jobIndex: number, patch: Partial<FormJob>) {
    setTeams((current) => current.map((team, index) => index === teamIndex
      ? { ...team, jobs: team.jobs.map((job, currentJobIndex) => currentJobIndex === jobIndex ? { ...job, ...patch } : job) }
      : team));
  }

  function updateLine(teamIndex: number, jobIndex: number, lineIndex: number, patch: Partial<FormLine>) {
    setTeams((current) => current.map((team, index) => index === teamIndex ? {
      ...team,
      jobs: team.jobs.map((job, currentJobIndex) => currentJobIndex === jobIndex ? {
        ...job,
        lines: job.lines.map((line, currentLineIndex) => currentLineIndex === lineIndex ? { ...line, ...patch } : line),
      } : job),
    } : team));
  }

  /** Kaydetmeden önce satırları denetler; hata varsa mesajı döndürür. */
  function validateJob(job: FormJob): string | null {
    if (!job.projectId && job.title.trim().length < 2) return "Her iş için proje seçin ya da başlık yazın";
    if (!job.lines.length) return "Her işte en az bir imalat satırı olmalı";
    for (const line of job.lines) {
      const quantity = toNumber(line.quantity);
      if (line.kind === "stage") {
        if (!line.progressId) return "İş kalemi satırlarında kalem seçin";
        if (quantity === null || quantity <= 0) return "İş kalemi satırlarında miktar girin";
      } else if (line.kind === "extra") {
        if (line.description.trim().length < 2) return "Ek iş açıklaması en az 2 karakter olmalı";
        if (quantity === null || quantity <= 0) return `${line.description.trim()} için miktar girin`;
        if (!line.unit.trim()) return `${line.description.trim()} için birim yazın`;
        if (canSeePrices && line.unitPrice.trim() && (toNumber(line.unitPrice) ?? -1) < 0) return `${line.description.trim()} için birim fiyat geçersiz`;
      } else if (line.description.trim().length < 2) {
        return "İmalat açıklaması en az 2 karakter olmalı";
      }
    }
    return null;
  }

  function removeTeam(teamIndex: number) {
    const team = teams[teamIndex];
    if (team.entryId) setRemovedEntryIds((current) => [...current, team.entryId!]);
    setTeams((current) => current.filter((_, index) => index !== teamIndex));
  }

  async function saveAll(finalize = false) {
    const completedTeams = teams.filter((team) => team.personnelId || team.jobs.some((job) => job.projectId || job.title.trim() || job.workId.trim() || job.lines.some((line) => line.description.trim() || line.progressId)));
    if (!completedTeams.length) return void toast.error("En az bir ekip ekleyin");
    if (completedTeams.some((team) => !team.personnelId)) return void toast.error("Her ekip için personel seçin");
    if (new Set(completedTeams.map((team) => team.personnelId)).size !== completedTeams.length) return void toast.error("Aynı personel bir günde yalnızca bir ekipte seçilebilir");
    const invalid = completedTeams.flatMap((team) => team.jobs.map(validateJob)).find(Boolean);
    if (invalid) return void toast.error(invalid);

    setLoading(true);
    try {
      const repository = new ProductionRepository(createClient());
      for (const entryId of removedEntryIds) await repository.deleteEntry(entryId);
      for (const team of completedTeams) {
        const person = personnelById.get(team.personnelId);
        if (!person) throw new Error("Seçilen personel bulunamadı");
        const jobs: ProductionSaveJob[] = team.jobs.map((job, jobIndex) => ({
          project_id: job.projectId || null,
          project_name: job.projectId ? "" : job.title.trim() || `İş / Proje ${jobIndex + 1}`,
          project_code: job.projectId ? "" : job.workId.trim(),
          sort_order: jobIndex,
          items: job.lines.map((line, lineIndex) => {
            const base = { kind: line.kind, item_id: line.itemId ?? undefined, sort_order: lineIndex };
            if (line.kind === "stage") return { ...base, progress_id: line.progressId, quantity: toNumber(line.quantity) ?? 0 };
            if (line.kind === "extra") return {
              ...base,
              item_name: line.description.trim(),
              quantity: toNumber(line.quantity) ?? 0,
              unit: line.unit.trim(),
              ...(canSeePrices ? { unit_price: toNumber(line.unitPrice) } : {}),
            };
            return { ...base, item_name: line.description.trim() };
          }),
        }));
        await repository.saveEntry({ entry_id: team.entryId, work_date: date, leader_id: person.id, leader_name: person.full_name, work_plan_id: null, jobs });
      }
      const entries = await repository.listEntries(date, date);
      setDailyEntries(entries);
      setTeams(entriesToTeams(entries, await loadPrices(entries)));
      setReportEntries((current) => [
        ...current.filter((entry) => entry.work_date !== date),
        ...entries,
      ]);
      setRemovedEntryIds([]);
      toast.success(finalize ? "Günlük imalatlar kaydedildi" : "Taslak kaydedildi; düzenlemeye devam edebilirsiniz");
      if (finalize) try {
        setPdfLoading(true);
        const shared = await saveAndShareDailyProduction(brand, entries, date);
        toast.success(shared ? "PDF paylaşım için hazırlandı" : "PDF indirildi; WhatsApp açıldı");
      } catch (shareError) {
        if ((shareError as Error).name === "AbortError") {
          toast.info("PDF paylaşımı iptal edildi");
        } else {
          console.error(shareError);
          toast.error("Kayıt tamamlandı, dosyalar oluşturulamadı", { description: (shareError as Error).message });
        }
      } finally {
        setPdfLoading(false);
      }
    } catch (error) {
      console.error(error);
      toast.error("İmalatlar kaydedilemedi", { description: (error as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function loadReport(nextFrom = from, nextTo = to) {
    if (!nextFrom || !nextTo) return void toast.error("Başlangıç ve bitiş tarihini seçin");
    if (nextFrom > nextTo) return void toast.error("Başlangıç tarihi bitiş tarihinden sonra olamaz");
    setLoading(true);
    try {
      setReportEntries(await new ProductionRepository(createClient()).listEntries(nextFrom, nextTo));
      setAppliedRange({ from: nextFrom, to: nextTo });
      setSelectedHistoryDate(null);
    }
    catch { toast.error("Geçmiş kayıtlar yüklenemedi"); }
    finally { setLoading(false); }
  }

  function selectHistoryDate(selectedDate: string) {
    setSelectedHistoryDate((current) => current === selectedDate ? null : selectedDate);
  }

  async function shareCurrentDay() {
    if (!dailyEntries.length) return void toast.error("Önce günlük imalatları kaydedin");
    setPdfLoading(true);
    try {
      const shared = await saveAndShareDailyProduction(brand, dailyEntries, date);
      toast.success(shared ? "PDF paylaşım için hazırlandı" : "PDF indirildi; WhatsApp açıldı");
    } catch (error) {
      if ((error as Error).name === "AbortError") toast.info("PDF paylaşımı iptal edildi");
      else {
        console.error(error);
        toast.error("Dosyalar oluşturulamadı", { description: (error as Error).message });
      }
    } finally {
      setPdfLoading(false);
    }
  }

  async function downloadHistoryPdf() {
    const entries = selectedHistoryDate ? selectedHistoryEntries : filteredReport;
    if (!entries.length) return void toast.error("PDF için kayıt seçin");
    setPdfLoading(true);
    try {
      const pdfFrom = selectedHistoryDate ?? appliedRange.from;
      const pdfTo = selectedHistoryDate ?? appliedRange.to;
      await downloadProductionHistoryPdf(brand, entries, pdfFrom, pdfTo);
      toast.success("Geçmiş imalat PDF'i indirildi");
    } catch (error) {
      console.error(error);
      toast.error("PDF oluşturulamadı", { description: (error as Error).message });
    } finally {
      setPdfLoading(false);
    }
  }

  return <div className="space-y-6 production-module">
    <header className="grid items-center gap-4 border-b pb-5 sm:grid-cols-[140px_1fr_180px]">
      <div className="h-16">
        <CompanyLogo brand={brand} className="h-16 max-w-[140px] object-contain" />
      </div>
      <h1 className="text-center text-xl font-bold sm:text-2xl">
        {brand.name}
        <span className="block text-base font-semibold text-muted-foreground sm:text-lg">GÜNLÜK İMALAT</span>
      </h1>
      <div className="space-y-1 sm:text-right"><Label htmlFor="production-date">Tarih</Label><Input id="production-date" type="date" value={date} onChange={(event) => void changeDate(event.target.value)} className="sm:ml-auto sm:w-40" /></div>
    </header>

    <div className="space-y-5">
      {teams.map((team, teamIndex) => { const accent = accents[teamIndex % accents.length]; return <section key={team.key} className={`overflow-hidden rounded-lg border border-l-4 ${accent.border}`}>
        <div className={`flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:justify-between ${accent.soft}`}>
          <div className="w-full max-w-md space-y-2"><Label className={accent.label}>Ekip Adı</Label><Select disabled={readOnly} value={team.personnelId || undefined} onValueChange={(value) => updateTeam(teamIndex, { personnelId: value })}><SelectTrigger><SelectValue placeholder="Personel seçin" /></SelectTrigger><SelectContent>{activePersonnel.map((person) => <SelectItem key={person.id} value={person.id} disabled={teams.some((other, index) => index !== teamIndex && other.personnelId === person.id)}>{person.full_name}</SelectItem>)}</SelectContent></Select></div>
          {!readOnly && teams.length > 1 && <Button type="button" size="icon" variant="ghost" title="Ekibi kaldır" onClick={() => removeTeam(teamIndex)}><Trash2 className="h-4 w-4" /></Button>}
        </div>
        <div className="space-y-4 p-4">{team.jobs.map((job, jobIndex) => { const jobTargets = job.projectId ? targets[job.projectId] : undefined; return <div key={job.key} className={`border-2 ${accent.jobBorder} bg-background p-4`}>
          <div className="mb-4 flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label className={accent.label}>İş / Proje {jobIndex + 1}</Label>
              <Select disabled={readOnly} value={job.projectId || FREE_JOB} onValueChange={(value) => selectProject(teamIndex, jobIndex, value === FREE_JOB ? "" : value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={FREE_JOB}>Listede olmayan iş (serbest)</SelectItem>
                  {projects.map((project) => <SelectItem key={project.id} value={project.id}>{project.project_code} · {project.name}</SelectItem>)}
                  {job.projectId && !projects.some((project) => project.id === job.projectId) && <SelectItem value={job.projectId}>{job.title || "Proje"} (arşivde)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            {!readOnly && team.jobs.length > 1 && <Button type="button" size="icon" variant="ghost" title="İşi kaldır" onClick={() => updateTeam(teamIndex, { jobs: team.jobs.filter((_, index) => index !== jobIndex) })}><Trash2 className="h-4 w-4" /></Button>}
          </div>
          {!job.projectId && <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
            <div className="space-y-1"><Label htmlFor={`job-title-${job.key}`}>Başlık</Label><Input id={`job-title-${job.key}`} disabled={readOnly} value={job.title} onChange={(event) => updateJob(teamIndex, jobIndex, { title: event.target.value })} placeholder="İş / proje başlığını yazın" className="font-semibold" /></div>
            <div className="space-y-1"><Label>ID</Label><Input disabled={readOnly} value={job.workId} onChange={(event) => updateJob(teamIndex, jobIndex, { workId: event.target.value })} placeholder="-" /></div>
          </div>}
          <div className="space-y-3">{job.lines.map((line, lineIndex) => <div key={line.key} className="grid grid-cols-[28px_minmax(0,1fr)_40px] items-start gap-2">
            <span className="pt-2 text-right text-sm font-semibold">{lineIndex + 1}:</span>
            {line.kind === "stage" ? <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_70px]">
              <Select disabled={readOnly} value={line.progressId || undefined} onValueChange={(value) => updateLine(teamIndex, jobIndex, lineIndex, { progressId: value, unit: jobTargets?.find((target) => target.progress_id === value)?.unit ?? "" })}>
                <SelectTrigger><SelectValue placeholder={jobTargets ? (jobTargets.length ? "İş kalemi seçin" : "Metrajlı iş kalemi yok") : "Yükleniyor..."} /></SelectTrigger>
                <SelectContent>{(jobTargets ?? []).map((target) => <SelectItem key={target.progress_id} value={target.progress_id}>{target.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input disabled={readOnly} inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(teamIndex, jobIndex, lineIndex, { quantity: event.target.value })} placeholder="Miktar" />
              <span className="self-center text-sm text-muted-foreground">{line.unit || "—"}</span>
              {jobTargets && !jobTargets.length && <p className="text-xs text-amber-700 sm:col-span-3">Bu projede birimi olan iş kalemi yok. Ayarlar → Proje Türleri&apos;nden aşamalara birim verin ya da &quot;Ek İş&quot; satırı kullanın.</p>}
            </div>
            : line.kind === "extra" ? <div className={`grid gap-2 ${canSeePrices ? "sm:grid-cols-[minmax(0,1fr)_100px_90px_120px]" : "sm:grid-cols-[minmax(0,1fr)_100px_90px]"}`}>
              <div className="relative"><Input disabled={readOnly} value={line.description} onChange={(event) => updateLine(teamIndex, jobIndex, lineIndex, { description: event.target.value })} placeholder="Ek iş açıklaması" className="pr-14" /><span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950 dark:text-violet-300">Ek iş</span></div>
              <Input disabled={readOnly} inputMode="decimal" value={line.quantity} onChange={(event) => updateLine(teamIndex, jobIndex, lineIndex, { quantity: event.target.value })} placeholder="Miktar" />
              <Input disabled={readOnly} value={line.unit} onChange={(event) => updateLine(teamIndex, jobIndex, lineIndex, { unit: event.target.value })} placeholder="Birim" list="production-units" />
              {canSeePrices && <div><Input disabled={readOnly} inputMode="decimal" value={line.unitPrice} onChange={(event) => updateLine(teamIndex, jobIndex, lineIndex, { unitPrice: event.target.value })} placeholder="Birim fiyat" />{toNumber(line.unitPrice) !== null && toNumber(line.quantity) !== null && <p className="mt-1 text-right text-xs text-muted-foreground">{formatMoney(toNumber(line.unitPrice)! * toNumber(line.quantity)!, currency)}</p>}</div>}
            </div>
            : <Textarea disabled={readOnly} value={line.description} onChange={(event) => updateLine(teamIndex, jobIndex, lineIndex, { description: event.target.value })} placeholder="İmalat açıklaması" rows={2} className="min-h-16 resize-y" />}
            {!readOnly && job.lines.length > 1 ? <Button type="button" size="icon" variant="ghost" title="Satırı kaldır" onClick={() => updateJob(teamIndex, jobIndex, { lines: job.lines.filter((_, index) => index !== lineIndex) })}><Trash2 className="h-4 w-4" /></Button> : <span />}
          </div>)}</div>
          {!readOnly && <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {job.projectId && <Button type="button" variant="outline" onClick={() => updateJob(teamIndex, jobIndex, { lines: [...job.lines, newLine("stage")] })}><Plus className="h-4 w-4" />İş Kalemi Ekle</Button>}
            <Button type="button" variant="outline" className={job.projectId ? "" : "sm:col-span-2"} onClick={() => updateJob(teamIndex, jobIndex, { lines: [...job.lines, newLine("extra")] })}><Plus className="h-4 w-4" />Ek İş Ekle</Button>
          </div>}
        </div>; })}
          {!readOnly && <Button type="button" variant="outline" className="w-full" onClick={() => updateTeam(teamIndex, { jobs: [...team.jobs, newJob()] })}><Plus className="h-4 w-4" />İş / Proje Ekle</Button>}
        </div>
      </section>; })}
      {!readOnly && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Button type="button" variant="outline" disabled={loading} onClick={() => void fillFromWorkPlan()} title="O günün iş planındaki ekipleri ve projeleri forma ekler"><ClipboardList className="h-4 w-4" />İş Planından Doldur</Button><Button type="button" variant="outline" onClick={() => setTeams((current) => [...current, newTeam()])}><Plus className="h-4 w-4" />Ekip Ekle</Button><Button type="button" variant="outline" disabled={loading || pdfLoading} onClick={() => void saveAll(false)}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Taslak Kaydet</Button><Button type="button" variant="outline" disabled={!dailyEntries.length || pdfLoading} onClick={() => void shareCurrentDay()}>{pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}Tekrar Paylaş</Button><Button type="button" disabled={loading || pdfLoading} onClick={() => void saveAll(true)}>{loading || pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Kaydet ve Paylaş</Button></div>}
      {!dailyEntries.length && !loading && <p className="text-center text-sm text-muted-foreground">Bu tarih için henüz kayıt yok.</p>}
      {!readOnly && <p className="text-center text-xs text-muted-foreground">İş kalemi satırları kaydedilince seçilen projeye iş kaydı olarak işlenir; proje ilerlemesi ve hakediş kendiliğinden güncellenir. Ek işler hakedişe ayrıca eklenir{canSeePrices ? "" : "; fiyatlarını hakediş yetkilisi girer"}.</p>}
      <datalist id="production-units">{["Adet", "m", "m²", "m³", "kg", "ton", "saat", "gün", "sefer", "Götürü"].map((unit) => <option key={unit} value={unit} />)}</datalist>
    </div>

    <Card className="screen-only"><CardHeader><CardTitle className="text-base">Geçmiş Kayıtlar ve A4 Çıktı</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Başlangıç"><Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="Bitiş"><Input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field><Field label="Ekip"><Select value={personnelFilter} onValueChange={(value) => { setPersonnelFilter(value); setSelectedHistoryDate(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tüm Ekipler</SelectItem>{reportPersonnel.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}</SelectContent></Select></Field></div>
      <div className="flex flex-wrap gap-2"><Button disabled={loading} onClick={() => void loadReport()}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}İmalatları Listele</Button><Button variant="outline" disabled={!filteredReport.length || pdfLoading} onClick={() => void downloadHistoryPdf()}>{pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}Filtrelenenleri PDF İndir</Button></div>
      <div className="border-t pt-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><p className="font-semibold">Filtrelenen İmalatlar</p><p className="text-sm text-muted-foreground">{formatDate(appliedRange.from)} - {formatDate(appliedRange.to)} · {filteredReport.length} ekip kaydı</p></div>{selectedHistoryDate && <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedHistoryDate(null)}>Tüm tarihleri göster</Button>}</div>
        <div className="space-y-5">{groupedReport.map(([historyDate, entries]) => {
          if (selectedHistoryDate && selectedHistoryDate !== historyDate) return null;
          return <section key={historyDate} className="overflow-hidden rounded-lg border">
            <button type="button" onClick={() => selectHistoryDate(historyDate)} className="flex w-full items-center justify-between bg-muted/50 px-4 py-3 text-left hover:bg-muted"><strong>{formatDate(historyDate)}</strong><span className="text-sm text-muted-foreground">{entries.length} ekip</span></button>
            <div className="space-y-4 p-4">{entries.map((entry) => <article key={entry.id} className="border-l-4 border-l-primary border p-4"><h4 className="font-bold">Ekip: {entry.team_leader_name_snapshot}</h4><div className="mt-3 space-y-3">{entry.jobs.map((job, jobIndex) => <div key={job.id} className="border p-3"><div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b pb-2"><strong>İş / Proje {jobIndex + 1}</strong><strong>ID: {job.project_code_snapshot || "-"}</strong></div><h5 className="mb-3 text-center font-bold">{job.project_name_snapshot}</h5><div className="space-y-2">{job.items.map((item, itemIndex) => <div key={item.id} className="grid grid-cols-[30px_minmax(0,1fr)] gap-2 text-sm"><strong>{itemIndex + 1}:</strong><span>{legacyDescription(item.item_name_snapshot, item.quantity, item.unit_snapshot)}</span></div>)}</div></div>)}</div></article>)}</div>
          </section>;
        })}</div>
        {!filteredReport.length && <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Seçilen tarih aralığı ve ekip için imalat kaydı bulunamadı.</p>}
      </div>
    </CardContent></Card>

    <section className="production-print-root hidden bg-white text-black">
      <div className="grid grid-cols-[100px_1fr_140px] items-center border-b-2 border-black pb-3"><div className="h-14"><CompanyLogo brand={brand} className="h-14 max-w-[100px] object-contain" /></div><h2 className="text-center text-lg font-bold">{brand.name} · GÜNLÜK İMALAT</h2><p className="text-right text-sm font-semibold">Tarih: {from === to ? formatDate(from) : `${formatDate(from)} - ${formatDate(to)}`}</p></div>
      <div className="mt-5 space-y-5">{filteredReport.map((entry, entryIndex) => { const accent = accents[entryIndex % accents.length]; return <article key={entry.id} className={`production-print-team border-2 border-l-8 border-black ${accent.border}`}><div className="border-b-2 border-black bg-slate-100 px-4 py-2 font-bold">EKİP ADI: {entry.team_leader_name_snapshot}</div><div className="space-y-3 p-3">{entry.jobs.map((job, jobIndex) => <div key={job.id} className="production-print-job border border-black p-3"><div className="mb-2 flex items-center justify-between border-b border-black pb-2"><strong>İŞ / PROJE {jobIndex + 1}</strong><strong>ID: {job.project_code_snapshot || "-"}</strong></div><div className="mb-3 text-center font-bold">{job.project_name_snapshot}</div><ol className="list-decimal space-y-2 pl-6">{job.items.map((item) => <li key={item.id}>{legacyDescription(item.item_name_snapshot, item.quantity, item.unit_snapshot)}</li>)}</ol></div>)}</div></article>; })}{!filteredReport.length && <p className="py-10 text-center">Filtreye uygun kayıt yok.</p>}</div>
    </section>

    <style jsx global>{`
      @page { size: A4 portrait; margin: 14mm; }
      @media print {
        body * { visibility: hidden !important; }
        .production-print-root, .production-print-root * { visibility: visible !important; }
        .production-print-root { display: block !important; position: absolute; inset: 0; width: 100%; border: 0 !important; padding: 0 !important; font-family: Arial, sans-serif; font-size: 11pt; }
        .production-print-team { break-inside: avoid-page; page-break-inside: avoid; }
        .production-print-job { break-inside: avoid-page; page-break-inside: avoid; }
        .production-print-root h2 { font-size: 15pt; }
      }
    `}</style>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
