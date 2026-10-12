import Link from "next/link";
import { CheckCircle2, CircleDashed, Sun } from "lucide-react";
import type { TodaySummary } from "@/modules/dashboard/today-repository";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Genel Bakış'ın üstündeki "Bugün" özeti: ekipler nerede, imalat girildi mi, puantaj ve şube özeti. */
export function TodayCard({
  today,
  branchNames,
  showBranches,
}: {
  today: TodaySummary;
  /** Şube kimliği → adı (erişilebilen şubeler). */
  branchNames: Record<string, string>;
  /** Birden fazla şube görünüyorsa şube özeti ve ekiplerde şube adı. */
  showBranches: boolean;
}) {
  const dateLabel = new Date(`${today.date}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
  const people = today.teams.reduce((sum, team) => sum + team.member_count, 0);
  const withProduction = today.teams.filter((team) => team.production).length;
  const { worked, leave, medical_report, absent } = today.attendance;
  const stats = [
    { label: "Sahadaki ekip", value: today.teams.length },
    { label: "İş planındaki kişi", value: people },
    { label: "İmalat girilen ekip", value: `${withProduction} / ${today.teams.length}` },
    { label: "Puantaj: çalıştı", value: worked },
    { label: "İzin / rapor / gelmedi", value: `${leave} / ${medical_report} / ${absent}` },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sun className="h-4 w-4 text-amber-500" />
          Bugün · {dateLabel}
        </CardTitle>
        <Button asChild size="sm" variant="outline">
          <Link href="/panel/work-plans">İş Planı</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-xl border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-xl font-semibold tabular-nums">{stat.value}</p>
            </div>
          ))}
        </div>

        {showBranches && today.branches.length > 1 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="px-2 py-2">Şube</th>
                  <th className="px-2 py-2 text-right">Ekip</th>
                  <th className="px-2 py-2 text-right">Kişi</th>
                  <th className="px-2 py-2 text-right">İmalat girilen</th>
                  <th className="px-2 py-2 text-right">Çalıştı</th>
                  <th className="px-2 py-2 text-right">İzin / rapor / gelmedi</th>
                </tr>
              </thead>
              <tbody>
                {today.branches.map((row) => (
                  <tr key={row.branch_id} className="border-b last:border-0">
                    <td className="px-2 py-2 font-medium">{branchNames[row.branch_id] ?? "—"}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.teams}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.people}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.teams_with_production} / {row.teams}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.worked}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{row.away}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {today.teams.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-6 text-center text-sm text-muted-foreground">
            <p>Bugün için iş planı girilmemiş.</p>
            <Button asChild size="sm">
              <Link href="/panel/work-plans/new">İş Planı Oluştur</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {today.teams.map((team) => (
              <div key={team.id} className="flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    <Badge className="mr-2 bg-secondary text-secondary-foreground">{team.team_type}</Badge>
                    {team.project_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      showBranches ? branchNames[team.branch_id] : null,
                      `Ekip başı: ${team.chief_name}`,
                      `${team.member_count} kişi`,
                      team.vehicle_plate && team.vehicle_plate !== "-" ? team.vehicle_plate : null,
                      team.work_location,
                    ].filter(Boolean).join(" · ")}
                  </p>
                  {team.production && team.production.length > 0 && (
                    <p className="mt-1 text-xs">{team.production.join(", ")}</p>
                  )}
                </div>
                {team.production ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    İmalat girildi
                  </span>
                ) : (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <CircleDashed className="h-4 w-4" />
                    İmalat bekleniyor
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {today.extraProduction.length > 0 && (
          <div className="rounded-xl border border-dashed px-3 py-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground">İş planı dışında girilen imalat</p>
            {today.extraProduction.map((entry, index) => (
              <p key={index} className="mt-1">
                <strong>{entry.leader}</strong>: {entry.items.join(", ") || "—"}
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
