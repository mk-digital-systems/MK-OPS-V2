"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Copy,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type {
  DailyWorkPlanWithTeams,
  Personnel,
  WorkPlanAbsenceSnapshot,
  WorkPlanAbsenceStatus,
  WorkPlanTeamSnapshot,
} from "@/types/work-plan";
import type { Vehicle } from "@/types/vehicle";
import { createClient } from "@/lib/supabase/client";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { ensureChiefFirst } from "@/modules/work-plans/whatsapp-formatter";
import { tomorrowISODate } from "@/lib/constants/project";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WhatsAppPreview } from "@/components/work-plans/whatsapp-preview";

type TeamDraft = {
  client_id: string;
  project_code: string;
  project_name: string;
  team_type: string;
  vehicle_plate: string;
  chief_personnel_id: string;
  chief_name: string;
  chief_phone: string;
  members: {
    personnel_id: string | null;
    full_name: string;
    job_title: string | null;
    phone: string | null;
    is_chief: boolean;
    sort_order: number;
  }[];
};

type Props = {
  personnel: Personnel[];
  vehicles: Vehicle[];
  initialDate?: string;
  existingPlanId?: string;
  initialTeams?: WorkPlanTeamSnapshot[];
  initialAbsences?: WorkPlanAbsenceSnapshot[];
  initialNotes?: string | null;
  draftId?: string;
};

function newClientId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `team-${Date.now()}-${Math.random()}`;
}

function emptyTeam(): TeamDraft {
  return {
    client_id: newClientId(),
    project_code: "",
    project_name: "",
    team_type: "",
    vehicle_plate: "",
    chief_personnel_id: "",
    chief_name: "",
    chief_phone: "",
    members: [],
  };
}

export function WorkPlanEditor({
  personnel,
  vehicles,
  initialDate,
  existingPlanId,
  initialTeams,
  initialAbsences,
  initialNotes,
  draftId,
}: Props) {
  const router = useRouter();
  const [planDate, setPlanDate] = useState(initialDate || tomorrowISODate());
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [teams, setTeams] = useState<TeamDraft[]>(() => {
    if (initialTeams?.length) {
      return initialTeams.map((t) => ({
        client_id: t.id ?? newClientId(),
        project_code: t.project_code === "-" ? "" : t.project_code,
        project_name: t.project_name,
        team_type: t.team_type,
        vehicle_plate: t.vehicle_plate,
        chief_personnel_id: t.chief_personnel_id ?? "",
        chief_name: t.chief_name,
        chief_phone: t.chief_phone,
        members: ensureChiefFirst(t.members).map((m) => ({
          personnel_id: m.personnel_id,
          full_name: m.full_name,
          job_title: m.job_title,
          phone: m.phone,
          is_chief: m.is_chief,
          sort_order: m.sort_order,
        })),
      }));
    }
    return [emptyTeam()];
  });
  const [loading, setLoading] = useState(false);
  const [previewPlan, setPreviewPlan] = useState<DailyWorkPlanWithTeams | null>(null);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [typeSuggestions, setTypeSuggestions] = useState<string[]>([]);
  const [absenceDialogOpen, setAbsenceDialogOpen] = useState(false);
  const [absences, setAbsences] = useState<WorkPlanAbsenceSnapshot[]>(
    initialAbsences ?? []
  );

  const activePersonnel = useMemo(
    () => personnel.filter((p) => p.is_active),
    [personnel]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  useEffect(() => {
    const supabase = createClient();
    const repo = new WorkPlanRepository(supabase);
    repo.getTeamTypeSuggestions("").then(setTypeSuggestions).catch(() => {});
  }, []);

  function updateTeam(clientId: string, patch: Partial<TeamDraft>) {
    setTeams((prev) =>
      prev.map((t) => (t.client_id === clientId ? { ...t, ...patch } : t))
    );
  }

  function personnelIdsUsedByOtherTeams(clientId: string) {
    return new Set(
      teams
        .filter((team) => team.client_id !== clientId)
        .flatMap((team) =>
          team.members.flatMap((member) =>
            member.personnel_id ? [member.personnel_id] : []
          )
        )
    );
  }

  function vehiclePlatesUsedByOtherTeams(clientId: string) {
    return new Set(
      teams
        .filter((team) => team.client_id !== clientId)
        .map((team) => team.vehicle_plate.trim().toLocaleUpperCase("tr-TR"))
        .filter(Boolean)
    );
  }

  function setVehicle(clientId: string, vehiclePlate: string) {
    const normalizedPlate = vehiclePlate.trim().toLocaleUpperCase("tr-TR");
    if (vehiclePlatesUsedByOtherTeams(clientId).has(normalizedPlate)) {
      toast.error(
        `${vehiclePlate} plakalı araç bu tarihte başka bir ekipte kullanılıyor.`
      );
      return;
    }
    updateTeam(clientId, { vehicle_plate: vehiclePlate });
  }

  function setChief(clientId: string, personnelId: string) {
    const person = activePersonnel.find((p) => p.id === personnelId);
    if (!person) return;
    if (personnelIdsUsedByOtherTeams(clientId).has(personnelId)) {
      toast.error(`${person.full_name} bu tarihte başka bir ekipte görevli.`);
      return;
    }
    if (absences.some((absence) => absence.personnel_id === personnelId)) {
      toast.error("Bu personel izinli/raporlu listesinde", {
        description: "Önce izinli/raporlu kaydını kaldırın.",
      });
      return;
    }

    setTeams((prev) =>
      prev.map((team) => {
        if (team.client_id !== clientId) return team;

        const others = team.members.filter(
          (m) => !m.is_chief && m.personnel_id !== personnelId
        );

        const members = ensureChiefFirst([
          {
            personnel_id: person.id,
            full_name: person.full_name,
            job_title: person.job_title,
            phone: person.phone,
            is_chief: true,
            sort_order: 0,
          },
          ...others.map((m, idx) => ({ ...m, is_chief: false, sort_order: idx + 1 })),
        ]);

        return {
          ...team,
          chief_personnel_id: person.id,
          chief_name: person.full_name,
          chief_phone: person.phone ?? team.chief_phone,
          members,
        };
      })
    );
  }

  function toggleMember(clientId: string, personnelId: string) {
    const person = activePersonnel.find((p) => p.id === personnelId);
    if (!person) return;

    const alreadySelected = teams
      .find((team) => team.client_id === clientId)
      ?.members.some(
        (member) => !member.is_chief && member.personnel_id === personnelId
      );
    if (
      !alreadySelected &&
      personnelIdsUsedByOtherTeams(clientId).has(personnelId)
    ) {
      toast.error(`${person.full_name} bu tarihte başka bir ekipte görevli.`);
      return;
    }
    if (
      !alreadySelected &&
      absences.some((absence) => absence.personnel_id === personnelId)
    ) {
      toast.error("Bu personel izinli/raporlu listesinde", {
        description: "Önce izinli/raporlu kaydını kaldırın.",
      });
      return;
    }

    setTeams((prev) =>
      prev.map((team) => {
        if (team.client_id !== clientId) return team;
        if (team.chief_personnel_id === personnelId) return team;

        const exists = team.members.some(
          (m) => !m.is_chief && m.personnel_id === personnelId
        );

        let members;
        if (exists) {
          members = team.members.filter(
            (m) => m.is_chief || m.personnel_id !== personnelId
          );
        } else {
          members = [
            ...team.members,
            {
              personnel_id: person.id,
              full_name: person.full_name,
              job_title: person.job_title,
              phone: null,
              is_chief: false,
              sort_order: team.members.length,
            },
          ];
        }

        return { ...team, members: ensureChiefFirst(members) };
      })
    );
  }

  function onMemberDragEnd(clientId: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setTeams((prev) =>
      prev.map((team) => {
        if (team.client_id !== clientId) return team;
        const sortable = team.members.filter((m) => !m.is_chief);
        const oldIndex = sortable.findIndex(
          (m) => (m.personnel_id ?? m.full_name) === active.id
        );
        const newIndex = sortable.findIndex(
          (m) => (m.personnel_id ?? m.full_name) === over.id
        );
        if (oldIndex < 0 || newIndex < 0) return team;
        const reordered = arrayMove(sortable, oldIndex, newIndex);
        const chief = team.members.find((m) => m.is_chief);
        const members = ensureChiefFirst([
          ...(chief ? [chief] : []),
          ...reordered,
        ]);
        return { ...team, members };
      })
    );
  }

  function moveTeam(index: number, direction: -1 | 1) {
    setTeams((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function toggleAbsence(person: Personnel) {
    const exists = absences.some(
      (absence) => absence.personnel_id === person.id
    );
    if (exists) {
      setAbsences((current) =>
        current.filter((absence) => absence.personnel_id !== person.id)
      );
      return;
    }

    const isInTeam = teams.some((team) =>
      team.members.some((member) => member.personnel_id === person.id)
    );
    if (isInTeam) {
      toast.error("Bu personel bir ekipte görevli", {
        description: "Önce personeli ekipten kaldırın.",
      });
      return;
    }

    setAbsences((current) => [
      ...current,
      {
        personnel_id: person.id,
        full_name: person.full_name,
        status: "leave",
      },
    ]);
  }

  function setAbsenceStatus(
    personnelId: string,
    status: WorkPlanAbsenceStatus
  ) {
    setAbsences((current) =>
      current.map((absence) =>
        absence.personnel_id === personnelId
          ? { ...absence, status }
          : absence
      )
    );
  }

  function removeAbsence(personnelId: string) {
    setAbsences((current) =>
      current.filter((absence) => absence.personnel_id !== personnelId)
    );
  }

  async function loadLatestPlan() {
    setLoadingLatest(true);
    try {
      const latest = await new WorkPlanRepository(createClient()).getLatestBefore(
        planDate
      );
      if (!latest) {
        toast.info("Önceki bir iş planı bulunamadı");
        return;
      }

      setTeams(
        latest.teams.map((team) => {
          const currentChief = personnel.find(
            (person) => person.id === team.chief_personnel_id
          );
          return {
          client_id: newClientId(),
          project_code: team.project_code === "-" ? "" : team.project_code,
          project_name: team.project_name,
          team_type: team.team_type,
          vehicle_plate: team.vehicle_plate,
          chief_personnel_id: team.chief_personnel_id ?? "",
          chief_name: currentChief?.full_name ?? team.chief_name,
          chief_phone: currentChief?.phone ?? team.chief_phone,
          members: ensureChiefFirst(team.members).map((member) => {
            const currentPerson = personnel.find(
              (person) => person.id === member.personnel_id
            );
            return {
              personnel_id: member.personnel_id,
              full_name: currentPerson?.full_name ?? member.full_name,
              job_title: currentPerson?.job_title ?? member.job_title,
              phone: member.is_chief
                ? currentPerson?.phone ?? member.phone
                : null,
              is_chief: member.is_chief,
              sort_order: member.sort_order,
            };
          }),
        }})
      );
      toast.success("Son liste yeni gün için şablon olarak getirildi");
    } catch (error) {
      console.error(error);
      toast.error("Son liste getirilemedi");
    } finally {
      setLoadingLatest(false);
    }
  }

  function planTeams() {
    return teams.map((team, index) => ({
      sort_order: index,
      project_code: team.project_code,
      project_name: team.project_name,
      team_type: team.team_type,
      vehicle_plate: team.vehicle_plate,
      chief_personnel_id: team.chief_personnel_id || null,
      chief_name: team.chief_name,
      chief_phone: team.chief_phone,
      members: ensureChiefFirst(team.members.map((member) =>
        member.is_chief
          ? { ...member, phone: team.chief_phone }
          : { ...member, phone: null }
      )),
    }));
  }

  async function handleDraftSave() {
    if (!planDate) {
      toast.error("Plan tarihi seçin");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");
      const saved = await new WorkPlanRepository(supabase).saveDraft({
        id: draftId,
        planDate,
        notes,
        userId: user.id,
        teams: planTeams(),
        absences,
      });
      toast.success("İş planı taslak olarak kaydedildi");
      router.push(`/work-plans/drafts/${saved.id}/edit`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Taslak kaydedilemedi");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!planDate) {
      toast.error("Plan tarihi seçin");
      return;
    }

    for (const [idx, team] of teams.entries()) {
      if (!team.project_name.trim()) {
        toast.error(`Ekip ${idx + 1}: Proje adı zorunlu`);
        return;
      }
      if (!team.team_type.trim() || !team.vehicle_plate.trim()) {
        toast.error(`Ekip ${idx + 1}: Ekip türü ve plaka zorunlu`);
        return;
      }
      if (!team.chief_personnel_id || !team.chief_name.trim()) {
        toast.error(`Ekip ${idx + 1}: Ekip şefi zorunlu`);
        return;
      }
      if (!team.chief_phone.trim()) {
        toast.error(`Ekip ${idx + 1}: Ekip şefi telefonu zorunlu`);
        return;
      }
      if (!team.members.some((m) => m.is_chief)) {
        toast.error(`Ekip ${idx + 1}: Ekip şefi listede yok`);
        return;
      }
    }

    const assignedPersonnel = new Set<string>();
    const assignedVehicles = new Set<string>();
    for (const team of teams) {
      for (const member of team.members) {
        if (!member.personnel_id) continue;
        if (assignedPersonnel.has(member.personnel_id)) {
          toast.error(
            `${member.full_name} bu tarihte başka bir ekipte görevli.`
          );
          return;
        }
        assignedPersonnel.add(member.personnel_id);
      }

      const normalizedPlate = team.vehicle_plate
        .trim()
        .toLocaleUpperCase("tr-TR");
      if (assignedVehicles.has(normalizedPlate)) {
        toast.error(
          `${team.vehicle_plate} plakalı araç bu tarihte başka bir ekipte kullanılıyor.`
        );
        return;
      }
      assignedVehicles.add(normalizedPlate);
    }

    if (!existingPlanId) {
      const now = new Date().toISOString();
      setPreviewPlan({
        id: draftId ?? "draft-preview",
        plan_date: planDate,
        notes: notes.trim() || null,
        created_by: null,
        updated_by: null,
        created_at: now,
        updated_at: now,
        teams: planTeams(),
        absences,
      });
      return;
    }

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
      const saved = await new WorkPlanRepository(supabase).upsertFullPlan({
        planDate,
        notes,
        userId: user.id,
        existingPlanId,
        absences,
        teams: planTeams(),
      });

      toast.success("İş planı mevcut kurallara göre kaydedildi");
      router.push(`/work-plans/${saved.id}`);
      router.refresh();
    } catch (error) {
      console.error(error);
      const errorMessage =
        error instanceof Error && error.message.trim()
          ? error.message
          : null;
      const isUniqueViolation =
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code?: string }).code === "23505";
      const message =
        (isUniqueViolation
          ? "Bu tarihte zaten bir iş planı var"
          : errorMessage ?? "İş planı kaydedilemedi");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function saveAfterWhatsAppShare() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Oturum bulunamadı");
      const repo = new WorkPlanRepository(supabase);
      const saved = await repo.upsertFullPlan({
        planDate,
        notes,
        userId: user.id,
        absences,
        teams: planTeams(),
      });
      if (draftId) await repo.deleteDraft(draftId);
      toast.success("WhatsApp paylaşımı tamamlandı; iş planı kaydedildi ve taslak kaldırıldı");
      setPreviewPlan(null);
      router.push(`/work-plans/${saved.id}`);
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "İş planı kaydedilemedi");
      throw error;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {draftId ? "Taslağı Düzenle" : existingPlanId ? "İş Planını Düzenle" : "Yeni İş Planı"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ekipler ve personeller o güne özel snapshot olarak saklanır.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!existingPlanId && (
            <Button
              type="button"
              variant="outline"
              onClick={loadLatestPlan}
              disabled={loading || loadingLatest || !planDate}
            >
              {loadingLatest ? <Loader2 className="animate-spin" /> : <Copy />}
              Son Listeyi Getir
            </Button>
          )}
          {!existingPlanId && (
            <Button type="button" variant="outline" onClick={handleDraftSave} disabled={loading || loadingLatest}>
              {loading && <Loader2 className="animate-spin" />}
              Taslak Olarak Kaydet
            </Button>
          )}
          <Button onClick={handleSave} disabled={loading || loadingLatest}>
            {loading && <Loader2 className="animate-spin" />}
            {existingPlanId ? "Değişiklikleri Kaydet" : "WhatsApp’a Gönder ve Kaydet"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Plan Bilgisi</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="plan_date">Plan Tarihi</Label>
            <Input
              id="plan_date"
              type="date"
              value={planDate}
              onChange={(e) => setPlanDate(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">Not (opsiyonel)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {teams.map((team, index) => (
          <Card key={team.client_id}>
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <CardTitle className="text-base">Ekip {index + 1}</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={index === 0}
                  onClick={() => moveTeam(index, -1)}
                >
                  Yukarı
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={index === teams.length - 1}
                  onClick={() => moveTeam(index, 1)}
                >
                  Aşağı
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setTeams((prev) =>
                      prev.length === 1
                        ? prev
                        : prev.filter((t) => t.client_id !== team.client_id)
                    )
                  }
                >
                  <Trash2 className="h-4 w-4" />
                  Sil
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Araç Plakası</Label>
                  <Select
                    value={team.vehicle_plate || undefined}
                    onValueChange={(value) => setVehicle(team.client_id, value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Şirket aracı seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {team.vehicle_plate &&
                        !vehicles.some(
                          (vehicle) => vehicle.plate === team.vehicle_plate
                        ) && (
                          <SelectItem value={team.vehicle_plate}>
                            {team.vehicle_plate} · Eski kayıt
                          </SelectItem>
                        )}
                      {vehicles
                        .filter(
                          (vehicle) =>
                            vehicle.plate === team.vehicle_plate ||
                            !vehiclePlatesUsedByOtherTeams(team.client_id).has(
                              vehicle.plate.trim().toLocaleUpperCase("tr-TR")
                            )
                        )
                        .map((vehicle) => (
                          <SelectItem key={vehicle.id} value={vehicle.plate}>
                            {vehicle.plate} · {vehicle.brand} {vehicle.model}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {vehicles.length === 0 && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Önce Araçlar menüsünden şirket aracı ekleyin.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Ekip Türü</Label>
                  <Input
                    list={`team-type-${team.client_id}`}
                    value={team.team_type}
                    onChange={(e) =>
                      updateTeam(team.client_id, { team_type: e.target.value })
                    }
                    placeholder="Fiber, Kazı, Montaj..."
                  />
                  <datalist id={`team-type-${team.client_id}`}>
                    {typeSuggestions.map((suggestion) => (
                      <option key={suggestion} value={suggestion} />
                    ))}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <Label>Proje Adı</Label>
                  <Input
                    value={team.project_name}
                    onChange={(e) =>
                      updateTeam(team.client_id, {
                        project_name: e.target.value,
                      })
                    }
                    placeholder="Barbaros FTTH"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Proje ID</Label>
                  <Input
                    value={team.project_code}
                    onChange={(e) =>
                      updateTeam(team.client_id, {
                        project_code: e.target.value,
                      })
                    }
                    placeholder="GF-102"
                  />
                  <p className="text-xs text-muted-foreground">Opsiyonel</p>
                </div>
                <div className="space-y-2">
                  <Label>Ekip Şefi</Label>
                  <Select
                    value={team.chief_personnel_id || undefined}
                    onValueChange={(v) => setChief(team.client_id, v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Personel seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {activePersonnel
                        .filter(
                          (person) =>
                            person.id === team.chief_personnel_id ||
                            !personnelIdsUsedByOtherTeams(team.client_id).has(
                              person.id
                            )
                        )
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.full_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ekip Şefi Telefonu</Label>
                  <Input
                    value={team.chief_phone}
                    readOnly
                    placeholder="05xx xxx xx xx"
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
                <div>
                  <p className="text-sm font-medium">Personeller</p>
                  <p className="text-xs text-muted-foreground">
                    Şef her zaman ilk sırada kalır. Diğerleri sürüklenerek
                    sıralanabilir.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {activePersonnel
                    .filter(
                      (p) =>
                        p.id !== team.chief_personnel_id &&
                        !personnelIdsUsedByOtherTeams(team.client_id).has(p.id)
                    )
                    .map((p) => {
                      const selected = team.members.some(
                        (m) => !m.is_chief && m.personnel_id === p.id
                      );
                      return (
                        <Button
                          key={p.id}
                          type="button"
                          size="sm"
                          variant={selected ? "default" : "outline"}
                          onClick={() => toggleMember(team.client_id, p.id)}
                        >
                          {p.full_name}
                        </Button>
                      );
                    })}
                </div>

                <div className="space-y-2">
                  {team.members
                    .filter((m) => m.is_chief)
                    .map((m) => (
                      <div
                        key={`chief-${m.personnel_id}`}
                        className="flex items-center justify-between rounded-xl border bg-background px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-medium">{m.full_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {team.chief_phone || "Telefon yok"}
                          </p>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          1. sıra
                        </span>
                      </div>
                    ))}

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={(e) => onMemberDragEnd(team.client_id, e)}
                  >
                    <SortableContext
                      items={team.members
                        .filter((m) => !m.is_chief)
                        .map((m) => m.personnel_id ?? m.full_name)}
                      strategy={verticalListSortingStrategy}
                    >
                      {team.members
                        .filter((m) => !m.is_chief)
                        .map((m) => (
                          <SortableMemberRow
                            key={m.personnel_id ?? m.full_name}
                            id={m.personnel_id ?? m.full_name}
                            name={m.full_name}
                          />
                        ))}
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        onClick={() => setTeams((prev) => [...prev, emptyTeam()])}
      >
        <Plus className="h-4 w-4" />
        Yeni Ekip Ekle
      </Button>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base">
              İzinli / Raporlu Personel
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Yalnızca bu günlük iş planının organizasyon bilgisidir.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setAbsenceDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
            İzinli / Raporlu Personel Ekle
          </Button>
        </CardHeader>
        <CardContent>
          {absences.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              İzinli veya raporlu personel eklenmedi.
            </p>
          ) : (
            <div className="space-y-2">
              {absences.map((absence) => (
                <div
                  key={absence.personnel_id}
                  className="flex flex-col gap-2 rounded-xl border px-3 py-2 sm:flex-row sm:items-center"
                >
                  <span className="min-w-0 flex-1 font-medium">
                    {absence.full_name}
                  </span>
                  <Select
                    value={absence.status}
                    onValueChange={(value) =>
                      setAbsenceStatus(
                        absence.personnel_id,
                        value as WorkPlanAbsenceStatus
                      )
                    }
                  >
                    <SelectTrigger className="w-full sm:w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="leave">İzinli</SelectItem>
                      <SelectItem value="sick_report">Raporlu</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeAbsence(absence.personnel_id)}
                    aria-label={`${absence.full_name} kaydını kaldır`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={absenceDialogOpen} onOpenChange={setAbsenceDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>İzinli / Raporlu Personel Ekle</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {activePersonnel.map((person) => {
              const selected = absences.some(
                (absence) => absence.personnel_id === person.id
              );
              return (
                <Button
                  key={person.id}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  className="w-full justify-start"
                  onClick={() => toggleAbsence(person)}
                >
                  {person.full_name}
                </Button>
              );
            })}
          </div>
          <Button type="button" onClick={() => setAbsenceDialogOpen(false)}>
            Tamam
          </Button>
        </DialogContent>
      </Dialog>

      {previewPlan && (
        <WhatsAppPreview
          plan={previewPlan}
          open
          onClose={() => setPreviewPlan(null)}
          onEdit={() => setPreviewPlan(null)}
          onShared={saveAfterWhatsAppShare}
        />
      )}
    </div>
  );
}

function SortableMemberRow({ id, name }: { id: string; name: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2"
    >
      <button
        type="button"
        className="text-muted-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <p className="text-sm font-medium">{name}</p>
    </div>
  );
}
