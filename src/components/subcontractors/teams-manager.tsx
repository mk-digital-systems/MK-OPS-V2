"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Pencil, Plus, UsersRound } from "lucide-react";
import { toast } from "sonner";
import type { Personnel } from "@/types/work-plan";
import type { Team } from "@/types/subcontractor";
import { createClient } from "@/lib/supabase/client";
import { SubcontractorRepository, subcontractorErrorMessage } from "@/modules/subcontractors/subcontractor-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

type Draft = { id: string | null; name: string; leader: string; subcontractor: string; active: boolean; notes: string };

export function TeamsManager({
  initialTeams,
  personnel,
  subcontractors,
  canEdit,
  canSeeSubcontractors,
}: {
  initialTeams: Team[];
  personnel: Personnel[];
  subcontractors: { id: string; name: string; is_active: boolean }[];
  canEdit: boolean;
  canSeeSubcontractors: boolean;
}) {
  const [teams, setTeams] = useState(initialTeams);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const personById = useMemo(() => new Map(personnel.map((person) => [person.id, person])), [personnel]);
  const subById = useMemo(() => new Map(subcontractors.map((sub) => [sub.id, sub])), [subcontractors]);

  // Bir personel yalnızca bir aktif ekibin başı olabilir.
  const busyLeaders = new Set(teams.filter((team) => team.is_active && team.id !== draft?.id).map((team) => team.leader_personnel_id));

  async function save() {
    if (!draft) return;
    if (draft.name.trim().length < 2) return toast.error("Ekip adı en az 2 karakter olmalı");
    if (!draft.leader) return toast.error("Ekip başını seçin");
    setSaving(true);
    try {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Oturum bulunamadı");
      const saved = await new SubcontractorRepository(supabase).saveTeam(
        draft.id,
        {
          name: draft.name,
          leader_personnel_id: draft.leader,
          subcontractor_id: draft.subcontractor || null,
          is_active: draft.active,
          notes: draft.notes,
        },
        data.user.id
      );
      setTeams((current) => [...current.filter((team) => team.id !== saved.id), saved].sort(sortTeams));
      toast.success(draft.id ? "Ekip güncellendi" : "Ekip eklendi");
      setDraft(null);
    } catch (error) {
      toast.error("Ekip kaydedilemedi", { description: subcontractorErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Ekipler</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ekip başı ve isteğe bağlı taşeron. İş planı ve imalatta ekip, ekip başından tanınır.
          </p>
        </div>
        {canEdit && (
          <Button onClick={() => setDraft({ id: null, name: "", leader: "", subcontractor: "", active: true, notes: "" })}>
            <Plus className="h-4 w-4" />
            Yeni Ekip
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Ekip Listesi</CardTitle>
          <CardDescription>
            Taşerona bağlı ekibin imalatı, girildiği anda o taşeronun hakedişine yazılır. Ekip sonradan başka taşerona geçse
            de eski imalatlar eski taşeronda kalır.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {teams.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <UsersRound className="h-8 w-8" />
              Henüz ekip tanımlanmadı. Ekip tanımlamak zorunlu değil; taşeronla çalışıyorsanız ekipleri buradan taşerona bağlayın.
            </div>
          )}
          {teams.map((team) => {
            const leader = personById.get(team.leader_personnel_id);
            const sub = team.subcontractor_id ? subById.get(team.subcontractor_id) : null;
            return (
              <div key={team.id} className="flex flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{team.name}</p>
                    {!team.is_active && <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Pasif</Badge>}
                    {team.subcontractor_id ? (
                      <Badge className="bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200">
                        Taşeron{canSeeSubcontractors && sub ? `: ${sub.name}` : ""}
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">Kendi ekibimiz</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ekip başı:{" "}
                    {leader ? (
                      <Link href={`/panel/personnel/${leader.id}`} className="text-primary hover:underline">
                        {leader.full_name}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {team.notes ? ` · ${team.notes}` : ""}
                  </p>
                </div>
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDraft({
                        id: team.id,
                        name: team.name,
                        leader: team.leader_personnel_id,
                        subcontractor: team.subcontractor_id ?? "",
                        active: team.is_active,
                        notes: team.notes ?? "",
                      })
                    }
                  >
                    <Pencil className="h-4 w-4" />
                    Düzenle
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={draft !== null} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Ekibi Düzenle" : "Yeni Ekip"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team-name">Ekip adı</Label>
                <Input id="team-name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="ör. Data Ekibi 1" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-leader">Ekip başı</Label>
                <NativeSelect id="team-leader" value={draft.leader} onChange={(event) => setDraft({ ...draft, leader: event.target.value })}>
                  <option value="">Personel seçin</option>
                  {personnel
                    .filter((person) => person.is_active && (!busyLeaders.has(person.id) || person.id === draft.leader))
                    .map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                      </option>
                    ))}
                </NativeSelect>
              </div>
              {canSeeSubcontractors && (
                <div className="space-y-2">
                  <Label htmlFor="team-sub">Taşeron</Label>
                  <NativeSelect id="team-sub" value={draft.subcontractor} onChange={(event) => setDraft({ ...draft, subcontractor: event.target.value })}>
                    <option value="">Kendi ekibimiz (taşeron yok)</option>
                    {subcontractors
                      .filter((sub) => sub.is_active || sub.id === draft.subcontractor)
                      .map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name}
                        </option>
                      ))}
                  </NativeSelect>
                  <p className="text-xs text-muted-foreground">Taşeron kartını ve pay yüzdesini Taşeronlar sayfasında tanımlayın.</p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="team-notes">Not (isteğe bağlı)</Label>
                <Textarea id="team-notes" rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
              </div>
              {draft.id && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} />
                  Ekip aktif
                </label>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDraft(null)}>
                  Vazgeç
                </Button>
                <Button onClick={save} disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Kaydet
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function sortTeams(a: Team, b: Team) {
  if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
  return a.name.localeCompare(b.name, "tr");
}
