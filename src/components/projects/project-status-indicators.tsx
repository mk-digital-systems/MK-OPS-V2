import type { Project } from "@/types/project";
import {
  formatBooleanChoice,
  getStatusColor,
  getStatusLabel,
  isOngoingProjectStatus,
} from "@/lib/constants/project";
import { Badge } from "@/components/ui/badge";

type Props = {
  project: Project;
};

export function ProjectStatusIndicators({ project }: Props) {
  if (project.is_cancelled) {
    return <Badge className="bg-rose-600 text-white hover:bg-rose-600">İptal Edildi</Badge>;
  }

  const isOngoing = isOngoingProjectStatus(project.status);

  if (!isOngoing) {
    return (
      <Badge className={getStatusColor(project.status)}>
        {getStatusLabel(project.status)}
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400 dark:bg-amber-500 dark:text-amber-950">
        Devam Ediyor
      </Badge>

      {project.status === "excavation_permit_waiting" && (
        <Badge className="border-amber-500 bg-background text-amber-700 dark:text-amber-300">
          Kazı İzni Bekliyor
        </Badge>
      )}

      {project.status === "delayed" && (
        <Badge className="border-rose-500 bg-background text-rose-700 dark:text-rose-300">
          Gecikmiş
        </Badge>
      )}

      <Badge className="border-border bg-background">
        Ek:{" "}
        {formatBooleanChoice(
          project.joint_done,
          "Yapıldı",
          "Yapılmadı"
        )}
      </Badge>

      {project.tracks_obk && (
        <Badge className="border-border bg-background">
          OBK:{" "}
          {formatBooleanChoice(
            project.obk_pulled,
            "Çekildi",
            "Çekilmedi"
          )}
        </Badge>
      )}
    </div>
  );
}
