import { cn } from "@/lib/utils";
import {
  getStageStatusMeta,
  getStatusBarColor,
  getStatusColor,
  getStatusLabel,
} from "@/lib/constants/project";
import { Badge } from "@/components/ui/badge";

export function ProjectStatusBadge({ status, className }: { status: string; className?: string }) {
  return <Badge className={cn(getStatusColor(status), className)}>{getStatusLabel(status)}</Badge>;
}

export function StageStatusBadge({ status }: { status: string }) {
  const meta = getStageStatusMeta(status);
  return <Badge className={meta.color}>{meta.label}</Badge>;
}

export function ProgressBar({
  value,
  status,
  showLabel = true,
  className,
}: {
  value: number;
  status?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", status ? getStatusBarColor(status) : "bg-primary")}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && <span className="w-10 text-right text-xs font-medium tabular-nums">%{percent}</span>}
    </div>
  );
}

export function TypeDot({ color }: { color: string | null }) {
  return <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color || "#94a3b8" }} />;
}
