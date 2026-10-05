import type { DailyWorkPlanWithTeams, WorkPlanTeamSnapshot } from "@/types/work-plan";
import { formatDate } from "@/lib/utils";

export function buildWhatsAppText(plan: DailyWorkPlanWithTeams): string {
  const lines: string[] = [
    "GÜNLÜK İŞ PLANI",
    formatDate(plan.plan_date, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }),
    "",
  ];

  plan.teams.forEach((team, index) => {
    const members = ensureChiefFirst(team.members);
    const chief = members.find((member) => member.is_chief);
    const formatMember = (name: string, jobTitle?: string | null) =>
      jobTitle?.trim() ? `${name} (${jobTitle.trim()})` : name;

    lines.push(`*EKİP ${index + 1}*`);
    lines.push(
      `Ekip Başı: ${formatMember(
        chief?.full_name || team.chief_name,
        chief?.job_title
      )}`
    );
    lines.push(`Telefon: ${chief?.phone || team.chief_phone || "-"}`);
    lines.push(`Araç: ${team.vehicle_plate || "-"}`);
    lines.push(`Ekip Türü: ${team.team_type || "-"}`);
    lines.push(`Proje Adı: ${team.project_name || "-"}`);
    lines.push(`Proje ID: ${team.project_code?.trim() || "-"}`);
    lines.push("Personeller:");
    members.forEach((member) => {
      lines.push(`- ${formatMember(member.full_name, member.job_title)}`);
    });

    lines.push("");
  });

  if (plan.absences.length > 0) {
    lines.push("İZİNLİ / RAPORLU PERSONEL");
    plan.absences.forEach((absence) => {
      const status = absence.status === "leave" ? "İzinli" : "Raporlu";
      lines.push(`- ${absence.full_name} — ${status}`);
    });
  }

  return lines.join("\n").trim();
}

export function ensureChiefFirst(
  members: WorkPlanTeamSnapshot["members"]
): WorkPlanTeamSnapshot["members"] {
  const chiefs = members.filter((m) => m.is_chief);
  const others = members.filter((m) => !m.is_chief);
  const ordered = [...chiefs, ...others].map((m, idx) => ({
    ...m,
    sort_order: idx,
  }));
  return ordered;
}
