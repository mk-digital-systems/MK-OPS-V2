import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ProjectType } from "@/types/project";
import { TypeDot } from "@/components/projects/project-status-indicators";

/** Proje türlerine hızlı filtre bağlantıları. */
export function ProjectTypeShortcuts({
  types,
  selectedTypeId,
  basePath = "/panel/projects",
}: {
  types: ProjectType[];
  selectedTypeId?: string;
  basePath?: string;
}) {
  if (types.length === 0) return null;
  const chip = "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors";
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={basePath}
        className={cn(chip, !selectedTypeId || selectedTypeId === "all" ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}
      >
        Tümü
      </Link>
      {types.map((type) => (
        <Link
          key={type.id}
          href={`${basePath}?type=${type.id}`}
          className={cn(chip, selectedTypeId === type.id ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}
        >
          <TypeDot color={type.color} />
          {type.name}
        </Link>
      ))}
    </div>
  );
}
