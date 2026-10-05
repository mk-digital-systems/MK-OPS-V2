"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { ProjectRepository } from "@/modules/projects/project-repository";
import {
  booleanToTriState,
  projectCreateSchema,
  projectEditSchema,
  triStateToBoolean,
  type ProjectCreateValues,
  type ProjectEditValues,
} from "@/lib/validations/project";
import type { Project } from "@/types/project";
import type { Personnel } from "@/types/work-plan";
import {
  OBK_OPTIONS,
  getStatusLabel,
  isBfOrGfProject,
  isHpFocusedProject,
  isCorporateStyleProject,
  todayISODate,
} from "@/lib/constants/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
  mode: "create" | "edit";
  project?: Project;
  typeOptions: { key: string; label: string }[];
  personnel: Personnel[];
};

export function ProjectForm({ mode, project, typeOptions, personnel }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState<string[]>([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  if (mode === "create") {
    return (
      <CreateProjectForm
        typeOptions={typeOptions}
        personnel={personnel}
        loading={loading}
        setLoading={setLoading}
        locationSuggestions={locationSuggestions}
        setLocationSuggestions={setLocationSuggestions}
        showLocationSuggestions={showLocationSuggestions}
        setShowLocationSuggestions={setShowLocationSuggestions}
        router={router}
      />
    );
  }

  return (
    <EditProjectForm
      project={project!}
      typeOptions={typeOptions}
      personnel={personnel}
      loading={loading}
      setLoading={setLoading}
      locationSuggestions={locationSuggestions}
      setLocationSuggestions={setLocationSuggestions}
      showLocationSuggestions={showLocationSuggestions}
      setShowLocationSuggestions={setShowLocationSuggestions}
      router={router}
    />
  );
}

type SharedProps = {
  typeOptions: { key: string; label: string }[];
  personnel: Personnel[];
  loading: boolean;
  setLoading: (v: boolean) => void;
  locationSuggestions: string[];
  setLocationSuggestions: (v: string[]) => void;
  showLocationSuggestions: boolean;
  setShowLocationSuggestions: (v: boolean) => void;
  router: ReturnType<typeof useRouter>;
};

function CreateProjectForm({
  typeOptions,
  personnel,
  loading,
  setLoading,
  locationSuggestions,
  setLocationSuggestions,
  showLocationSuggestions,
  setShowLocationSuggestions,
  router,
}: SharedProps) {
  const form = useForm<ProjectCreateValues>({
    resolver: zodResolver(projectCreateSchema),
    defaultValues: {
      project_code: "",
      name: "",
      project_type: typeOptions[0]?.key ?? "HP_ODAKLI",
      location: typeOptions[0]?.key === "HP_ODAKLI" ? "Adres belirtilmedi" : "",
      description: "",
      image_url: "",
      received_at: todayISODate(),
      status: "waiting",
      project_date: "",
      priority_order: "",
      completed_by_personnel_id: "",
      completed_by_name: "",
      current_team_leader_personnel_id: "",
      current_team_leader_name: "",
      tracks_obk: false,
      tracks_excavation: false,
      sheet_count: 1,
      hp_count: 0,
      is_single_sheet: false,
      bgfd_t7: 0,
      bgfd_t9: 0,
      bgfd_t11: 0,
      bgfd_t21: 0,
      bgfd_t23: 0,
      bgfd_t7_sd: "",
      bgfd_t9_sd: "",
      bgfd_t11_sd: "",
      bgfd_t21_sd: "",
      bgfd_t23_sd: "",
    },
  });

  const locationValue = form.watch("location");
  const projectType = form.watch("project_type");
  const isBfOrGf = isBfOrGfProject(projectType);
  const isHpFocused = isHpFocusedProject(projectType);
  const isCorporate = isCorporateStyleProject(projectType);
  const hpSheetCount = Math.max(1, form.watch("sheet_count") || 1);
  const [hpSheets,setHpSheets]=useState([{sheet_no:"",address:"",hp_count:0,notes:"",image_url:""}]);

  useEffect(()=>{if(!isHpFocused)return;setHpSheets(current=>Array.from({length:hpSheetCount},(_,index)=>current[index]??{sheet_no:"",address:"",hp_count:0,notes:"",image_url:""}));},[hpSheetCount,isHpFocused]);

  useLocationSuggestions(locationValue, setLocationSuggestions);

  const filteredLocations = useMemo(
    () =>
      locationSuggestions.filter(
        (v) =>
          !locationValue ||
          v.toLowerCase().includes(locationValue.toLowerCase())
      ),
    [locationSuggestions, locationValue]
  );

  async function onSubmit(values: ProjectCreateValues) {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Oturum bulunamadı");
      setLoading(false);
      return;
    }

    try {
      if (values.project_type === "HP_ODAKLI" && hpSheets.some(sheet=>!sheet.sheet_no.trim())) {
        toast.error("Her pafta için manuel pafta numarası girin"); setLoading(false); return;
      }
      if (values.project_type === "HP_ODAKLI") {
        const normalizedSheetNumbers=hpSheets.map(sheet=>sheet.sheet_no.trim().toLocaleLowerCase("tr-TR"));
        if(new Set(normalizedSheetNumbers).size!==normalizedSheetNumbers.length){toast.error("Aynı pafta numarası bir projede birden fazla kullanılamaz");setLoading(false);return;}
        if(hpSheets.some(sheet=>sheet.image_url.trim()&&!/^https?:\/\//i.test(sheet.image_url.trim()))){toast.error("Pafta görsel URL'si http:// veya https:// ile başlamalı");setLoading(false);return;}
      }
      const created = await new ProjectRepository(supabase).create({
        project_code: values.project_code,
        name: values.name,
        project_type: values.project_type,
        location: values.project_type === "HP_ODAKLI" ? (hpSheets[0]?.address.trim() || "Adres belirtilmedi") : values.location,
        description: values.description || null,
        image_url: values.project_type === "HP_ODAKLI" ? null : values.image_url || null,
        received_at: values.received_at || todayISODate(),
        tracks_obk:
          isBfOrGfProject(values.project_type) && values.tracks_obk,
        tracks_excavation: values.tracks_excavation,
        tracks_cable: false,
        tracks_joint: false,
        sheet_count: isBfOrGfProject(values.project_type) ? values.sheet_count : null,
        hp_count: isBfOrGfProject(values.project_type) ? values.hp_count : null,
        is_single_sheet: values.is_single_sheet,
        cabinet_counts: values.project_type === "BGFD" ? { T7: values.bgfd_t7, T9: values.bgfd_t9, T11: values.bgfd_t11, T21: values.bgfd_t21, T23: values.bgfd_t23 } : undefined,
        cabinet_sd_codes: values.project_type === "BGFD" ? { T7: values.bgfd_t7_sd.split(",").map(v=>v.trim()).filter(Boolean), T9: values.bgfd_t9_sd.split(",").map(v=>v.trim()).filter(Boolean), T11: values.bgfd_t11_sd.split(",").map(v=>v.trim()).filter(Boolean), T21: values.bgfd_t21_sd.split(",").map(v=>v.trim()).filter(Boolean), T23: values.bgfd_t23_sd.split(",").map(v=>v.trim()).filter(Boolean) } : undefined,
        initial_sheets: values.project_type === "HP_ODAKLI" ? hpSheets.map(sheet=>({sheet_no:sheet.sheet_no.trim(),address:sheet.address.trim()||null,hp_count:Number(sheet.hp_count)||0,notes:sheet.notes.trim()||null,image_url:sheet.image_url.trim()||null})) : undefined,
        status: isCorporate ? values.status : undefined,
        project_date: isCorporate ? values.project_date || null : null,
        priority_order: isCorporate && values.priority_order !== "" ? Number(values.priority_order) : null,
        completed_by_personnel_id: isCorporate ? values.completed_by_personnel_id || null : null,
        completed_by_name: isCorporate ? values.completed_by_name || null : null,
        current_team_leader_personnel_id: isCorporate && values.status === "in_progress" ? values.current_team_leader_personnel_id || null : null,
        current_team_leader_name: isCorporate && values.status === "in_progress" ? values.current_team_leader_name || null : null,
        created_by: user.id,
        updated_by: user.id,
      });
      toast.success("Proje oluşturuldu", {
        description: `${created.project_code} · Başlamadı`,
      });
      router.push(`/projects/${created.id}`);
      router.refresh();
    } catch (error) {
      console.error(error);
      const errorMessage=error&&typeof error==="object"&&"message" in error?String((error as {message?:string}).message):"";
      const message =
        errorMessage.toLocaleLowerCase("tr-TR").includes("pafta")
          ? errorMessage
          :
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
          ? "Bu Proje ID zaten kayıtlı"
          : "Proje oluşturulamadı";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Yeni Proje</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(onSubmit, () =>
            toast.error("Kaydedilemedi", {
              description: "Lütfen eksik veya hatalı alanları kontrol edin.",
            })
          )}
          className="space-y-5"
        >
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            Yeni projeler <strong>Başlamadı</strong> durumunda kaydedilir. Girişte
            yalnız <strong>Alınan Tarih</strong> işlenir. Bitiş tarihi arşive
            aktarımda kaydedilir.
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project_code">Proje ID</Label>
              <Input
                id="project_code"
                placeholder="Firma proje numarası"
                {...form.register("project_code")}
              />
              {form.formState.errors.project_code && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.project_code.message}
                </p>
              )}
            </div>

            {!isHpFocused && !isCorporate && <div className="space-y-2">
              <Label htmlFor="received_at">Alınan Tarih</Label>
              <Input
                id="received_at"
                type="date"
                {...form.register("received_at")}
              />
              {form.formState.errors.received_at && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.received_at.message}
                </p>
              )}
            </div>}

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Proje Adı</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Proje Türü</Label>
              <Select
                value={form.watch("project_type")}
                onValueChange={(v) => {form.setValue("project_type", v);if(v==="HP_ODAKLI")form.setValue("location","Adres belirtilmedi");else if(form.getValues("location")==="Adres belirtilmedi")form.setValue("location","");}}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tür seçin" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isHpFocused && <LocationField
              label={isCorporate ? "Lokasyon" : "Mevki"}
              form={form}
              show={showLocationSuggestions}
              setShow={setShowLocationSuggestions}
              suggestions={filteredLocations}
            />}

            {isHpFocused&&<div className="space-y-4 rounded-xl border p-4 md:col-span-2"><div className="space-y-2"><Label>Pafta Sayısı</Label><Input type="number" min="1" value={hpSheetCount} onChange={e=>form.setValue("sheet_count",Math.max(1,Number(e.target.value)))}/></div>{hpSheets.map((sheet,index)=><div key={index} className="grid gap-3 rounded-xl bg-muted/30 p-4 md:grid-cols-2"><p className="font-medium md:col-span-2">{hpSheetCount===1?"Pafta Bilgileri":`Pafta ${index+1}`}</p><div><Label>Pafta No *</Label><Input value={sheet.sheet_no} onChange={e=>setHpSheets(v=>v.map((s,i)=>i===index?{...s,sheet_no:e.target.value}:s))}/></div><div><Label>HP Adedi</Label><Input type="number" min="0" value={sheet.hp_count} onChange={e=>setHpSheets(v=>v.map((s,i)=>i===index?{...s,hp_count:Number(e.target.value)}:s))}/></div><div className="md:col-span-2"><Label>Adres Bilgisi</Label><Input value={sheet.address} onChange={e=>setHpSheets(v=>v.map((s,i)=>i===index?{...s,address:e.target.value}:s))}/></div><div className="md:col-span-2"><Label>Görsel URL</Label><Input type="url" placeholder="https://..." value={sheet.image_url} onChange={e=>setHpSheets(v=>v.map((s,i)=>i===index?{...s,image_url:e.target.value}:s))}/></div><div className="md:col-span-2"><Label>Not</Label><Textarea value={sheet.notes} onChange={e=>setHpSheets(v=>v.map((s,i)=>i===index?{...s,notes:e.target.value}:s))}/></div></div>)}</div>}

            {isCorporate && <CorporateCreateFields form={form} personnel={personnel} />}

            {isBfOrGf && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-4 md:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                  checked={form.watch("tracks_obk")}
                  onChange={(event) =>
                    form.setValue("tracks_obk", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium">OBK takibi var</span>
                  <span className="block text-xs text-muted-foreground">
                    İşaretlenirse bu projede OBK çekildi/çekilmedi bilgisi takip edilir.
                    İşaretlenmezse OBK alanı hiç gösterilmez.
                  </span>
                </span>
              </label>
            )}

            {!isHpFocused && !isCorporate&&<label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-4 md:col-span-2"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={form.watch("tracks_excavation")} onChange={e=>form.setValue("tracks_excavation",e.target.checked)}/><span><span className="block text-sm font-medium">Kazı var</span><span className="block text-xs text-muted-foreground">Paftalarda kazı izni ve kazı yapım aşamaları takip edilir.</span></span></label>}


            {projectType === "BGFD" && <div className="space-y-3 rounded-xl border p-4 md:col-span-2"><div><p className="text-sm font-medium">BGFD Dolap Bilgileri</p><p className="text-xs text-muted-foreground">Adedi ve her dolabın üç haneli SD numarasını virgülle ayırarak girin.</p></div><div className="grid gap-3">{(["T7","T9","T11","T21","T23"] as const).map(type=>{const key=type.toLowerCase() as "t7"|"t9"|"t11"|"t21"|"t23";return <div key={type} className="grid gap-2 sm:grid-cols-[140px_1fr]"><div><Label>{type} Adedi</Label><Input type="number" min="0" {...form.register(`bgfd_${key}`)}/></div><div><Label>{type} SD Numaraları</Label><Input placeholder="Örn: 123, 456" {...form.register(`bgfd_${key}_sd`)}/>{form.formState.errors[`bgfd_${key}_sd`]&&<p className="text-xs text-destructive">{form.formState.errors[`bgfd_${key}_sd`]?.message}</p>}</div></div>})}</div>{form.formState.errors.bgfd_t7&&<p className="text-xs text-destructive">{form.formState.errors.bgfd_t7.message}</p>}</div>}

            {isBfOrGf && <><div className="space-y-2"><Label htmlFor="sheet_count">Pafta Sayısı</Label><Input id="sheet_count" type="number" min="1" {...form.register("sheet_count")}/></div><div className="space-y-2"><Label htmlFor="hp_count">HP Bilgisi</Label><Input id="hp_count" type="number" min="0" {...form.register("hp_count")}/></div></>}

            {projectType !== "BGFD" && !isHpFocused && !isCorporate && <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-4 md:col-span-2"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={form.watch("is_single_sheet")} onChange={e=>form.setValue("is_single_sheet",e.target.checked)}/><span><span className="block text-sm font-medium">Proje tek paftadan oluşuyor</span><span className="block text-xs text-muted-foreground">Tek pafta otomatik oluşturulur ve alanları proje kartında gösterilir.</span></span></label>}

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="image_url">Görsel URL</Label>
              <Input id="image_url" type="url" placeholder="https://..." {...form.register("image_url")} />
              {form.formState.errors.image_url && (
                <p className="text-xs text-destructive">{form.formState.errors.image_url.message}</p>
              )}
            </div>

            {!isHpFocused && <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">{isCorporate ? "Not" : "Açıklama"}</Label>
              <Textarea id="description" {...form.register("description")} />
            </div>}
          </div>

          <FormActions loading={loading} submitLabel="Proje Oluştur" router={router} />
        </form>
      </CardContent>
    </Card>
  );
}

function EditProjectForm({
  project,
  typeOptions,
  personnel,
  loading,
  setLoading,
  locationSuggestions,
  setLocationSuggestions,
  showLocationSuggestions,
  setShowLocationSuggestions,
  router,
}: SharedProps & { project: Project }) {
  const form = useForm<ProjectEditValues>({
    resolver: zodResolver(projectEditSchema),
    defaultValues: {
      project_code: project.project_code,
      name: project.name,
      project_type: project.project_type,
      location: project.location ?? "",
      description: project.description ?? "",
      image_url: project.image_url ?? "",
      received_at: project.received_at ?? "",
      status: project.status,
      tracks_obk: project.tracks_obk ?? false,
      tracks_excavation: project.tracks_excavation ?? false,
      obk_pulled: booleanToTriState(project.obk_pulled),
      progress_notes: project.progress_notes ?? "",
      project_date: project.project_date ?? "",
      priority_order: project.priority_order ?? "",
      completed_by_personnel_id: project.completed_by_personnel_id ?? "",
      completed_by_name: project.completed_by_name ?? "",
      current_team_leader_personnel_id: project.current_team_leader_personnel_id ?? "",
      current_team_leader_name: project.current_team_leader_name ?? "",
    },
  });

  const locationValue = form.watch("location");
  const status = form.watch("status");
  const projectType = form.watch("project_type");
  const isBfOrGf = isBfOrGfProject(projectType);
  const tracksObk = form.watch("tracks_obk");
  const isHpFocused = isHpFocusedProject(projectType);
  const isCorporate = isCorporateStyleProject(projectType);

  useLocationSuggestions(locationValue, setLocationSuggestions);

  const filteredLocations = useMemo(
    () =>
      locationSuggestions.filter(
        (v) =>
          !locationValue ||
          v.toLowerCase().includes(locationValue.toLowerCase())
      ),
    [locationSuggestions, locationValue]
  );

  async function onSubmit(values: ProjectEditValues) {
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      toast.error("Oturum bulunamadı");
      setLoading(false);
      return;
    }

    try {
      await new ProjectRepository(supabase).update(project.id, {
        project_code: values.project_code,
        name: values.name,
        project_type: values.project_type,
        location: values.location,
        description: values.description || null,
        image_url: isHpFocused ? undefined : values.image_url || null,
        received_at: values.received_at,
        tracks_cable: isCorporate ? undefined : false,
        cable_pulled: isCorporate ? undefined : null,
        tracks_obk: isCorporate ? undefined : isBfOrGf && values.tracks_obk,
        obk_pulled: isCorporate ? undefined : isBfOrGf && values.tracks_obk
          ? triStateToBoolean(values.obk_pulled)
          : null,
        tracks_joint: isCorporate ? undefined : false,
        tracks_excavation: isCorporate ? undefined : values.tracks_excavation,
        joint_done: isCorporate ? undefined : null,
        progress_notes: values.progress_notes || null,
        status: isCorporate ? values.status : undefined,
        project_date: isCorporate ? values.project_date || null : null,
        priority_order: isCorporate && values.priority_order !== "" ? Number(values.priority_order) : null,
        completed_by_personnel_id: isCorporate ? values.completed_by_personnel_id || null : null,
        completed_by_name: isCorporate ? values.completed_by_name || null : null,
        current_team_leader_personnel_id: isCorporate && values.status === "in_progress" ? values.current_team_leader_personnel_id || null : null,
        current_team_leader_name: isCorporate && values.status === "in_progress" ? values.current_team_leader_name || null : null,
        completed_at: isCorporate && values.status === "completed" ? (project.completed_at || todayISODate()) : isCorporate ? null : undefined,
        is_archived: isCorporate ? values.status === "completed" : undefined,
        archived_at: isCorporate && values.status === "completed" ? (project.archived_at || new Date().toISOString()) : isCorporate ? null : undefined,
        updated_by: user.id,
      });
      toast.success("Proje güncellendi");
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch (error) {
      console.error(error);
      const errorMessage = error && typeof error === "object" && "message" in error
        ? String((error as { message?: string }).message)
        : "";
      const message =
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "23505"
          ? "Bu Proje ID zaten kayıtlı"
          : "Proje güncellenemedi";
      toast.error(message, { description: errorMessage || undefined });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Projeyi Düzenle</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={form.handleSubmit(onSubmit, (errors) =>
            toast.error("Kaydedilemedi", {
              description: getFirstFormError(errors),
            })
          )}
          className="space-y-5"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="project_code">Proje ID</Label>
              <Input
                id="project_code"
                placeholder="Firma proje numarası"
                {...form.register("project_code")}
              />
              {form.formState.errors.project_code && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.project_code.message}
                </p>
              )}
            </div>

            {!isHpFocused && <div className="space-y-2 md:col-span-2">
              <Label htmlFor="name">Proje Adı</Label>
              <Input id="name" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.name.message}
                </p>
              )}
            </div>}

            <div className="space-y-2">
              <Label>Proje Türü</Label>
              <Select
                value={form.watch("project_type")}
                onValueChange={(v) => form.setValue("project_type", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tür seçin" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {!isCorporate && <div className="space-y-2">
              <Label>Durum</Label>
              <Input value={getStatusLabel(status)} disabled />
              <p className="text-xs text-muted-foreground">
                Durum, proje aşamalarına göre sistem tarafından otomatik belirlenir.
              </p>
            </div>}

            {isCorporate && <CorporateEditFields form={form} personnel={personnel} />}

            {!isHpFocused && !isCorporate && <div className="space-y-2">
              <Label htmlFor="received_at">Alınan Tarih</Label>
              <Input
                id="received_at"
                type="date"
                {...form.register("received_at")}
              />
              {form.formState.errors.received_at && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.received_at.message}
                </p>
              )}
            </div>}

            {!isHpFocused && <LocationField
              label={isCorporate ? "Lokasyon" : "Mevki"}
              form={form}
              show={showLocationSuggestions}
              setShow={setShowLocationSuggestions}
              suggestions={filteredLocations}
            />}

            {isBfOrGf && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-4 md:col-span-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                  checked={tracksObk}
                  onChange={(event) =>
                    form.setValue("tracks_obk", event.target.checked)
                  }
                />
                <span>
                  <span className="block text-sm font-medium">OBK takibi var</span>
                  <span className="block text-xs text-muted-foreground">
                    İşaret kaldırılırsa bu projede OBK bilgisi gösterilmez.
                  </span>
                </span>
              </label>
            )}

            {!isHpFocused && !isCorporate&&<label className="flex cursor-pointer items-start gap-3 rounded-xl border bg-muted/30 p-4 md:col-span-2"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={form.watch("tracks_excavation")} onChange={e=>form.setValue("tracks_excavation",e.target.checked)}/><span><span className="block text-sm font-medium">Kazı takibi var</span><span className="block text-xs text-muted-foreground">Değişiklik yeni pafta ve dolaplara uygulanır.</span></span></label>}


            {isBfOrGf && !isHpFocused && !isCorporate && (
              <div className="md:col-span-2 space-y-4 rounded-2xl border bg-muted/30 p-4">
                <div>
                  <p className="text-sm font-medium">{projectType} Proje Takibi</p>
                  <p className="text-xs text-muted-foreground">
                    OBK durumunu işaretleyin; gerekirse açıklama ekleyin.
                  </p>
                </div>
                <div className="grid gap-4">
                  {tracksObk && (
                  <div className="space-y-2">
                    <Label>OBK</Label>
                    <Select
                      value={form.watch("obk_pulled")}
                      onValueChange={(v) =>
                        form.setValue(
                          "obk_pulled",
                          v as ProjectEditValues["obk_pulled"]
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        {OBK_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.obk_pulled && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.obk_pulled.message}
                      </p>
                    )}
                  </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="progress_notes">İş Adımı Açıklaması</Label>
                    <Textarea
                      id="progress_notes"
                      placeholder="OBK ile ilgili notlar..."
                      {...form.register("progress_notes")}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="image_url">Görsel URL</Label>
              <Input id="image_url" type="url" placeholder="https://..." {...form.register("image_url")} />
              {form.formState.errors.image_url && (
                <p className="text-xs text-destructive">{form.formState.errors.image_url.message}</p>
              )}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">{isCorporate ? "Not" : "Genel Açıklama"}</Label>
              <Textarea id="description" {...form.register("description")} />
            </div>
          </div>

          <FormActions loading={loading} submitLabel="Kaydet" router={router} />
        </form>
      </CardContent>
    </Card>
  );
}

function useLocationSuggestions(
  locationValue: string,
  setLocationSuggestions: (v: string[]) => void
) {
  useEffect(() => {
    const supabase = createClient();
    const repo = new ProjectRepository(supabase);
    const timer = setTimeout(async () => {
      try {
        const values = await repo.getLocationSuggestions(locationValue || "", 12);
        setLocationSuggestions(values);
      } catch {
        /* sessiz */
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [locationValue, setLocationSuggestions]);
}

function getFirstFormError(errors: Record<string, { message?: unknown } | undefined>) {
  const firstError = Object.values(errors).find((error) => error?.message);
  return firstError?.message
    ? String(firstError.message)
    : "Lütfen eksik veya hatalı alanları kontrol edin.";
}

function CorporateCreateFields({ form, personnel }: { form: UseFormReturn<ProjectCreateValues>; personnel: Personnel[] }) {
  const status = form.watch("status");
  return <div className="grid gap-4 rounded-xl border p-4 md:col-span-2 md:grid-cols-2">
    {status==="in_progress"&&<CurrentLeaderCreateField form={form} personnel={personnel}/>}
    <div className="space-y-2"><Label>Durum</Label><Select value={status} onValueChange={value=>form.setValue("status",value as ProjectCreateValues["status"])}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="waiting">Başlamadı</SelectItem><SelectItem value="in_progress">Devam Ediyor</SelectItem><SelectItem value="excavation_permit_waiting">Kazı İzni Bekliyor</SelectItem><SelectItem value="completed">Bitti</SelectItem></SelectContent></Select></div>
    <div className="space-y-2"><Label>Toplam Proje Tarihi</Label><Input type="date" {...form.register("project_date")}/></div>
    <div className="space-y-2"><Label>Öncelik Sırası</Label><Input type="number" min="1" placeholder="Belirtilmesi zorunlu değil" {...form.register("priority_order")}/></div>
    {status==="completed"&&<div className="space-y-2"><Label>Bitiren Ekip Başı *</Label><Select value={form.watch("completed_by_personnel_id")||""} onValueChange={id=>{const person=personnel.find(item=>item.id===id);form.setValue("completed_by_personnel_id",id);form.setValue("completed_by_name",person?.full_name??"");}}><SelectTrigger><SelectValue placeholder="Ekip başı seçin"/></SelectTrigger><SelectContent>{personnel.map(person=><SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</SelectContent></Select>{form.formState.errors.completed_by_personnel_id&&<p className="text-xs text-destructive">{form.formState.errors.completed_by_personnel_id.message}</p>}</div>}
  </div>;
}

function CorporateEditFields({ form, personnel }: { form: UseFormReturn<ProjectEditValues>; personnel: Personnel[] }) {
  const status = form.watch("status");
  return <div className="grid gap-4 rounded-xl border p-4 md:col-span-2 md:grid-cols-2">
    {status==="in_progress"&&<CurrentLeaderEditField form={form} personnel={personnel}/>}
    <div className="space-y-2"><Label>Durum</Label><Select value={status} onValueChange={value=>form.setValue("status",value as ProjectEditValues["status"])}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="waiting">Başlamadı</SelectItem><SelectItem value="in_progress">Devam Ediyor</SelectItem><SelectItem value="excavation_permit_waiting">Kazı İzni Bekliyor</SelectItem><SelectItem value="completed">Bitti</SelectItem></SelectContent></Select></div>
    <div className="space-y-2"><Label>Toplam Proje Tarihi</Label><Input type="date" {...form.register("project_date")}/></div>
    <div className="space-y-2"><Label>Öncelik Sırası</Label><Input type="number" min="1" placeholder="Belirtilmesi zorunlu değil" {...form.register("priority_order")}/></div>
    {status==="completed"&&<div className="space-y-2"><Label>Bitiren Ekip Başı *</Label><Select value={form.watch("completed_by_personnel_id")||""} onValueChange={id=>{const person=personnel.find(item=>item.id===id);form.setValue("completed_by_personnel_id",id);form.setValue("completed_by_name",person?.full_name??"");}}><SelectTrigger><SelectValue placeholder="Ekip başı seçin"/></SelectTrigger><SelectContent>{personnel.map(person=><SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</SelectContent></Select>{form.formState.errors.completed_by_personnel_id&&<p className="text-xs text-destructive">{form.formState.errors.completed_by_personnel_id.message}</p>}</div>}
  </div>;
}

function CurrentLeaderCreateField({form,personnel}:{form:UseFormReturn<ProjectCreateValues>;personnel:Personnel[]}) {
  return <div className="space-y-2"><Label>Mevcut Ekip Başı *</Label><Select value={form.watch("current_team_leader_personnel_id")||""} onValueChange={id=>{const person=personnel.find(item=>item.id===id);form.setValue("current_team_leader_personnel_id",id);form.setValue("current_team_leader_name",person?.full_name??"");}}><SelectTrigger><SelectValue placeholder="Ekip başı seçin"/></SelectTrigger><SelectContent>{personnel.map(person=><SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</SelectContent></Select>{form.formState.errors.current_team_leader_personnel_id&&<p className="text-xs text-destructive">{form.formState.errors.current_team_leader_personnel_id.message}</p>}</div>;
}

function CurrentLeaderEditField({form,personnel}:{form:UseFormReturn<ProjectEditValues>;personnel:Personnel[]}) {
  return <div className="space-y-2"><Label>Mevcut Ekip Başı *</Label><Select value={form.watch("current_team_leader_personnel_id")||""} onValueChange={id=>{const person=personnel.find(item=>item.id===id);form.setValue("current_team_leader_personnel_id",id);form.setValue("current_team_leader_name",person?.full_name??"");}}><SelectTrigger><SelectValue placeholder="Ekip başı seçin"/></SelectTrigger><SelectContent>{personnel.map(person=><SelectItem key={person.id} value={person.id}>{person.full_name}</SelectItem>)}</SelectContent></Select>{form.formState.errors.current_team_leader_personnel_id&&<p className="text-xs text-destructive">{form.formState.errors.current_team_leader_personnel_id.message}</p>}</div>;
}

function LocationField({
  label,
  form,
  show,
  setShow,
  suggestions,
}: {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: any;
  show: boolean;
  setShow: (v: boolean) => void;
  suggestions: string[];
}) {
  return (
    <div className="relative space-y-2">
      <Label htmlFor="location">{label}</Label>
      <Input
        id="location"
        autoComplete="off"
        {...form.register("location")}
        onFocus={() => setShow(true)}
        onBlur={() => setTimeout(() => setShow(false), 150)}
      />
      {show && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border bg-popover p-1 shadow-md">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
              onMouseDown={() => {
                form.setValue("location", item);
                setShow(false);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {form.formState.errors.location && (
        <p className="text-xs text-destructive">
          {form.formState.errors.location.message}
        </p>
      )}
    </div>
  );
}

function FormActions({
  loading,
  submitLabel,
  router,
}: {
  loading: boolean;
  submitLabel: string;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <Button type="submit" disabled={loading}>
        {loading && <Loader2 className="animate-spin" />}
        {submitLabel}
      </Button>
      <Button type="button" variant="outline" onClick={() => router.back()}>
        İptal
      </Button>
    </div>
  );
}
