"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type {
  DailyWorkPlan,
  DailyWorkPlanWithTeams,
  WorkPlanSearchHit,
  WorkPlanDraft,
} from "@/types/work-plan";
import { formatDate } from "@/lib/utils";
import { todayISODate } from "@/lib/constants/project";
import { createClient } from "@/lib/supabase/client";
import { WorkPlanRepository } from "@/modules/work-plans/work-plan-repository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  todayPlan: DailyWorkPlanWithTeams | null;
  pastPlans: DailyWorkPlan[];
  drafts: WorkPlanDraft[];
  readOnly?: boolean;
};

export function WorkPlansHome({ todayPlan, pastPlans, drafts, readOnly = false }: Props) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<WorkPlanSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [deletingMonth, setDeletingMonth] = useState<string | null>(null);
  const router = useRouter();

  const today = todayISODate();

  const pastOnly = useMemo(
    () => pastPlans.filter((p) => p.plan_date !== today),
    [pastPlans, today]
  );

  const completedMonths = useMemo(() => {
    const currentMonth = today.slice(0, 7);
    return [...new Set(pastPlans
      .map((plan) => plan.plan_date.slice(0, 7))
      .filter((month) => month < currentMonth))];
  }, [pastPlans, today]);

  async function deleteMonth(month: string) {
    const label = new Intl.DateTimeFormat("tr-TR", {
      month: "long",
      year: "numeric",
      timeZone: "Europe/Istanbul",
    }).format(new Date(`${month}-01T12:00:00+03:00`));
    if (!window.confirm(`${label} ayındaki tüm iş planları kalıcı olarak silinsin mi?`)) return;
    setDeletingMonth(month);
    try {
      await new WorkPlanRepository(createClient()).deletePlansByMonth(month);
      toast.success(`${label} ayına ait iş planları silindi`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aylık iş planları silinemedi");
    } finally {
      setDeletingMonth(null);
    }
  }

  async function handleSearch() {
    const q = query.trim();
    if (!q) {
      setHits(null);
      return;
    }
    setSearching(true);
    try {
      const supabase = createClient();
      const results = await new WorkPlanRepository(supabase).search(q);
      setHits(results);
    } catch (error) {
      console.error(error);
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">İş Planı</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Günlük ekip planları, geçmiş kayıtlar ve WhatsApp paylaşımı
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <Button asChild>
              <Link href="/work-plans/new">
                <Plus className="h-4 w-4" />
                Yeni İş Planı
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Geçmişte Ara</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="Tarih, Proje ID, proje adı, plaka, personel..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSearch();
              }}
            />
            <Button onClick={handleSearch} disabled={searching}>
              <Search className="h-4 w-4" />
              Ara
            </Button>
          </div>
          {hits && (
            <div className="space-y-2">
              {hits.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sonuç yok.</p>
              ) : (
                hits.map((hit) => (
                  <Link
                    key={hit.team_id}
                    href={`/work-plans/${hit.plan_id}`}
                    className="block rounded-xl border px-4 py-3 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                        {formatDate(hit.plan_date)}
                      </Badge>
                      <span className="text-sm font-medium">
                        {hit.project_code} · {hit.project_name}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {hit.team_type} · {hit.vehicle_plate} · {hit.chief_name}
                      {hit.member_names.length
                        ? ` · ${hit.member_names.join(", ")}`
                        : ""}
                    </p>
                  </Link>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!readOnly && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Taslaklar</h2>
          {drafts.length === 0 ? (
            <Card><CardContent className="p-5 text-sm text-muted-foreground">Kaydedilmiş taslak bulunmuyor.</CardContent></Card>
          ) : drafts.map((draft) => (
            <Link key={draft.id} href={`/work-plans/drafts/${draft.id}/edit`}>
              <Card className="mb-2 transition-colors hover:bg-accent/30">
                <CardContent className="flex items-center justify-between p-4">
                  <div>
                    <p className="font-medium">{formatDate(draft.plan_date)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{draft.teams.length} ekip · Düzenlemeye devam et</p>
                  </div>
                  <Badge className="border border-amber-300 bg-amber-50 text-amber-700">Taslak</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Bugünün İş Planı
        </h2>
        {todayPlan ? (
          <Link href={`/work-plans/${todayPlan.id}`}>
            <Card className="transition-all hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="flex items-start justify-between gap-4 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">
                      {formatDate(todayPlan.plan_date)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {todayPlan.teams.length} ekip
                    {todayPlan.teams[0]
                      ? ` · ${todayPlan.teams
                          .map((t) => t.project_code)
                          .join(", ")}`
                      : ""}
                  </p>
                </div>
                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  Bugün
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Bugün için henüz iş planı yok.
              </p>
              <Button asChild>
                <Link href="/work-plans/new">Bugünün Planını Oluştur</Link>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>

      {!readOnly && completedMonths.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">Aylık Kayıt Temizleme</h2>
          <Card>
            <CardContent className="space-y-3 p-5">
              <p className="text-sm text-muted-foreground">
                Geçmiş planlar tek tek silinemez. Yalnızca tamamlanmış bir aya ait planların tamamı silinebilir.
              </p>
              <div className="flex flex-wrap gap-2">
                {completedMonths.map((month) => (
                  <Button
                    key={month}
                    type="button"
                    variant="destructive"
                    disabled={deletingMonth !== null}
                    onClick={() => deleteMonth(month)}
                  >
                    {deletingMonth === month ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    {new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric", timeZone: "Europe/Istanbul" }).format(new Date(`${month}-01T12:00:00+03:00`))}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Geçmiş İş Planları
        </h2>
        <div className="space-y-2">
          {pastOnly.length === 0 ? (
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                Geçmiş plan bulunmuyor.
              </CardContent>
            </Card>
          ) : (
            pastOnly.map((plan) => (
              <Link key={plan.id} href={`/work-plans/${plan.id}`}>
                <Card className="mb-2 transition-colors hover:bg-accent/30">
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">
                        {formatDate(plan.plan_date)}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">Aç</span>
                  </CardContent>
                </Card>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
