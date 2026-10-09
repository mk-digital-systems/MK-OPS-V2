"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Project, ProjectType } from "@/types/project";
import { projectSchema, type ProjectFormOutput, type ProjectFormValues } from "@/lib/validations/project";
import { createClient } from "@/lib/supabase/client";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  mode: "create" | "edit";
  project?: Project;
  types: ProjectType[];
  locations: string[];
};

export function ProjectForm({ mode, project, types, locations }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
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
    },
  });
  const errors = form.formState.errors;
  const selectedType = types.find((type) => type.id === form.watch("project_type_id"));
  const typeLocked = mode === "edit" && !!project?.has_activity;

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
      };
      const saved =
        mode === "create" ? await repository.create(payload, user.id) : await repository.update(project!.id, payload, user.id);
      toast.success(mode === "create" ? "Proje oluşturuldu" : "Proje güncellendi");
      router.push(`/panel/projects/${saved.id}`);
      router.refresh();
    } catch (error) {
      const message = (error as { message?: string; code?: string })?.message ?? "";
      toast.error("Proje kaydedilemedi", {
        description: message.includes("projects_project_code_key") ? "Bu proje kodu zaten kullanılıyor." : message,
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
      <Card>
        <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
          <Field label="Proje türü" error={errors.project_type_id?.message} className="sm:col-span-2">
            <NativeSelect {...form.register("project_type_id")} disabled={typeLocked}>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </NativeSelect>
            {selectedType && (
              <p className="text-xs text-muted-foreground">
                Aşamalar: {selectedType.stages.map((stage) => stage.name).join(" → ")}
                {selectedType.has_sections && ` · ${selectedType.section_label} bazında takip`}
              </p>
            )}
            {typeLocked && <p className="text-xs text-muted-foreground">İş kaydı girilmiş projenin türü değiştirilemez.</p>}
          </Field>
          <Field label="Proje kodu" error={errors.project_code?.message}>
            <Input {...form.register("project_code")} placeholder="Örn. PRJ-2026-014" />
          </Field>
          <Field label="Proje adı" error={errors.name?.message}>
            <Input {...form.register("name")} />
          </Field>
          <Field label="Konum" error={errors.location?.message}>
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
          <Field label="Açıklama" error={errors.description?.message} className="sm:col-span-2">
            <Textarea rows={4} {...form.register("description")} />
          </Field>
        </CardContent>
      </Card>
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
