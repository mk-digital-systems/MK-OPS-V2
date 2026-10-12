"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CorporateStatus, Project } from "@/types/project";
import type { Personnel } from "@/types/work-plan";
import { CORPORATE_STATUSES, corporateStatusOf, todayISODate } from "@/lib/constants/project";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { ProjectRepository } from "@/modules/projects/project-repository";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

export type CorporateStatusValue = {
  status: CorporateStatus;
  leaderId: string;
  completedAt: string;
};

/** Durum, ekip başı ve bitiş tarihi alanları (proje oluşturma ve proje sayfası). */
export function CorporateStatusFields({
  value,
  onChange,
  personnel,
  disabled = false,
}: {
  value: CorporateStatusValue;
  onChange: (value: CorporateStatusValue) => void;
  personnel: Personnel[];
  disabled?: boolean;
}) {
  const needsLeader = value.status === "in_progress" || value.status === "completed";
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <div className="space-y-2">
        <Label>Durum</Label>
        <NativeSelect
          value={value.status}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, status: event.target.value as CorporateStatus })}
        >
          {CORPORATE_STATUSES.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      {needsLeader && (
        <div className="space-y-2">
          <Label>{value.status === "completed" ? "Bitiren ekip başı *" : "Mevcut ekip başı *"}</Label>
          <NativeSelect value={value.leaderId} disabled={disabled} onChange={(event) => onChange({ ...value, leaderId: event.target.value })}>
            <option value="">Ekip başı seçin</option>
            {personnel.map((person) => (
              <option key={person.id} value={person.id}>
                {person.full_name}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      {value.status === "completed" && (
        <div className="space-y-2">
          <Label>Bitiş tarihi *</Label>
          <Input
            type="date"
            value={value.completedAt}
            max={todayISODate()}
            disabled={disabled}
            onChange={(event) => onChange({ ...value, completedAt: event.target.value })}
          />
        </div>
      )}
    </div>
  );
}

/** Kaydetmeden önce kontrol; hata metni döner. */
export function validateCorporateStatus(value: CorporateStatusValue): string | null {
  if (value.status === "in_progress" && !value.leaderId) return "Devam eden projenin ekip başını seçin";
  if (value.status === "completed" && !value.leaderId) return "Projeyi bitiren ekip başını seçin";
  if (value.status === "completed" && !value.completedAt) return "Bitiş tarihini girin";
  return null;
}

export async function saveCorporateStatus(repository: ProjectRepository, projectId: string, value: CorporateStatusValue, personnel: Personnel[]) {
  const leader = personnel.find((person) => person.id === value.leaderId);
  const withLeader = value.status === "in_progress" || value.status === "completed";
  await repository.setCorporateStatus(projectId, {
    status: value.status,
    leader: withLeader && leader ? { id: leader.id, name: leader.full_name } : null,
    completedAt: value.status === "completed" ? value.completedAt : null,
  });
}

/** Kurumsal projenin durumu: elle seçilir; aşama yoktur. */
export function CorporateStatusPanel({
  project,
  personnel,
  readOnly,
}: {
  project: Project;
  personnel: Personnel[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const current = corporateStatusOf(project);
  const [value, setValue] = useState<CorporateStatusValue>({
    status: current,
    leaderId: (current === "completed" ? project.completed_by_personnel_id : project.current_team_leader_personnel_id) ?? "",
    completedAt: project.completed_at ?? todayISODate(),
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    const problem = validateCorporateStatus(value);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      await saveCorporateStatus(new ProjectRepository(createClient()), project.id, value, personnel);
      toast.success("Proje durumu güncellendi");
      router.refresh();
    } catch (error) {
      toast.error("Kaydedilemedi", { description: (error as Error)?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Proje durumu</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CorporateStatusFields value={value} onChange={setValue} personnel={personnel} disabled={readOnly || saving} />
        {current === "completed" && project.completed_by_name && (
          <p className="text-sm text-muted-foreground">
            {project.completed_by_name} bitirdi{project.completed_at ? ` · ${formatDate(project.completed_at)}` : ""}
          </p>
        )}
        {!readOnly && (
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Durumu kaydet
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
