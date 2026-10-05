"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Pencil, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DailyWorkPlanWithTeams } from "@/types/work-plan";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { Button } from "@/components/ui/button";
import { WhatsAppPreview } from "@/components/work-plans/whatsapp-preview";
import { WorkPlanTeamTable } from "@/components/work-plans/work-plan-team-table";
import { WorkPlanAbsences } from "@/components/work-plans/work-plan-absences";
import { useRouter } from "next/navigation";

type Props = {
  plan: DailyWorkPlanWithTeams;
  readOnly?: boolean;
  initialPreviewOpen?: boolean;
  sourceDraftId?: string;
};

export function WorkPlanDetailView({ plan, readOnly = false, initialPreviewOpen = false, sourceDraftId }: Props) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(initialPreviewOpen);
  const [currentPlan, setCurrentPlan] = useState(plan);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deletePlan() {
    const confirmed = window.confirm(
      `${formatDate(currentPlan.plan_date)} tarihli iş planı ve tüm ekipleri kalıcı olarak silinsin mi?`
    );
    if (!confirmed) return;

    setDeletingId(currentPlan.id);
    try {
      await new WorkPlanRepository(createClient()).deletePlan(currentPlan.id);
      toast.success("İş planı silindi");
      router.push("/work-plans");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("İş planı silinemedi");
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteTeam(teamId: string, teamIndex: number) {
    if (currentPlan.teams.length === 1) {
      await deletePlan();
      return;
    }

    const confirmed = window.confirm(
      `Ekip ${teamIndex + 1} bu iş planından kalıcı olarak silinsin mi?`
    );
    if (!confirmed) return;

    setDeletingId(teamId);
    try {
      await new WorkPlanRepository(createClient()).deleteTeam(teamId);
      setCurrentPlan((previous) => ({
        ...previous,
        teams: previous.teams.filter((team) => team.id !== teamId),
      }));
      toast.success("Ekip silindi");
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("Ekip silinemedi");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {formatDate(currentPlan.plan_date)} İş Planı
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {currentPlan.teams.length} ekip · snapshot kayıt
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <Button asChild variant="outline">
              <Link href={`/work-plans/${currentPlan.id}/edit`}>
                <Pencil className="h-4 w-4" />
                Düzenle
              </Link>
            </Button>
          )}
          <Button onClick={() => setPreviewOpen(true)}>
            <Share2 className="h-4 w-4" />
            WhatsApp İçin Hazırla
          </Button>
          {!readOnly && <Button
            variant="destructive"
            onClick={deletePlan}
            disabled={deletingId !== null}
          >
            {deletingId === currentPlan.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Planı Sil
          </Button>}
        </div>
      </div>

      <div className="space-y-4">
        {currentPlan.teams.map((team, index) => (
          <div key={team.id ?? index} className="space-y-2">
            {!readOnly && <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={!team.id || deletingId !== null}
                onClick={() => team.id && deleteTeam(team.id, index)}
              >
                {deletingId === team.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                Ekibi Sil
              </Button>
            </div>}
            <WorkPlanTeamTable team={team} teamIndex={index} />
          </div>
        ))}
      </div>

      <WorkPlanAbsences absences={currentPlan.absences} />

      <WhatsAppPreview
        plan={currentPlan}
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        onEdit={() => {
          setPreviewOpen(false);
          router.push(`/work-plans/${currentPlan.id}/edit`);
        }}
        onShared={sourceDraftId ? async () => {
          await new WorkPlanRepository(createClient()).deleteDraft(sourceDraftId);
          toast.success("WhatsApp paylaşımı tamamlandı; taslak kaldırıldı");
          router.replace(`/work-plans/${currentPlan.id}`);
          router.refresh();
        } : undefined}
      />
    </div>
  );
}
