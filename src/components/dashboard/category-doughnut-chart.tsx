"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  DashboardCategoryAnalysis,
  ProjectAnalysisStage,
} from "@/types/project";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type StageConfig = {
  key: ProjectAnalysisStage;
  label: string;
  color: string;
};

const STAGES: StageConfig[] = [
  { key: "not_started", label: "Başlamadı", color: "#94a3b8" },
  {
    key: "excavation_waiting",
    label: "Kazı İzni Bekliyor",
    color: "#f97316",
  },
  { key: "in_progress", label: "Devam Ediyor", color: "#3b82f6" },
  { key: "completed", label: "Bitti", color: "#2563eb" },
];

const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function buildStageHref(category: string, stage: ProjectAnalysisStage): string {
  const params = new URLSearchParams({ type: category, scope: "all" });

  if (stage === "not_started") params.set("status", "waiting");
  else if (stage === "completed") params.set("status", "completed");
  else if (stage === "excavation_waiting")
    params.set("status", "excavation_permit_waiting");
  else params.set("status", "in_progress");

  return `/projects?${params.toString()}`;
}

export function CategoryDoughnutChart({
  analysis,
}: {
  analysis: DashboardCategoryAnalysis;
}) {
  const router = useRouter();
  const [hovered, setHovered] = useState<StageConfig | null>(null);
  let accumulated = 0;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-center text-xl">{analysis.label ?? analysis.category}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative mx-auto aspect-square w-full max-w-[290px]">
          {hovered && (
            <div className="pointer-events-none absolute left-1/2 top-1 z-20 min-w-32 -translate-x-1/2 rounded-xl border bg-popover px-3 py-2 text-center text-xs shadow-lg">
              <p className="font-semibold">{hovered.label}</p>
              <p>{analysis[hovered.key]} {analysis.unit_label ?? "Proje"}</p>
              <p className="text-muted-foreground">
                %
                {analysis.total > 0
                  ? Math.round((analysis[hovered.key] / analysis.total) * 100)
                  : 0}
              </p>
            </div>
          )}

          <svg
            viewBox="0 0 180 180"
            className="h-full w-full"
            role="img"
            aria-label={`${analysis.label ?? analysis.category} durum dağılımı`}
          >
            <circle
              cx="90"
              cy="90"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="25"
              className="text-muted/50"
            />
            {STAGES.map((stage) => {
              const count = analysis[stage.key];
              const length =
                analysis.total > 0
                  ? (count / analysis.total) * CIRCUMFERENCE
                  : 0;
              const offset = accumulated;
              accumulated += length;

              if (length === 0) return null;

              return (
                <circle
                  key={stage.key}
                  cx="90"
                  cy="90"
                  r={RADIUS}
                  fill="none"
                  stroke={stage.color}
                  strokeWidth="25"
                  strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                  strokeDashoffset={-offset}
                  transform="rotate(-90 90 90)"
                  className="cursor-pointer transition-opacity hover:opacity-80"
                  onMouseEnter={() => setHovered(stage)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() =>
                    router.push(buildStageHref(analysis.category, stage.key))
                  }
                />
              );
            })}
            <text
              x="90"
              y="76"
              textAnchor="middle"
              className="fill-muted-foreground text-[8px]"
            >
              Toplam {analysis.unit_label ?? "Proje"}
            </text>
            <text
              x="90"
              y="102"
              textAnchor="middle"
              className="fill-foreground text-[25px] font-bold"
            >
              {analysis.total}
            </text>
          </svg>
        </div>

        <div className="mt-4 grid gap-2">
          {STAGES.map((stage) => (
            <Link
              key={stage.key}
              href={buildStageHref(analysis.category, stage.key)}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />
                {stage.label}
              </span>
              <span className="font-semibold tabular-nums">
                {analysis[stage.key]}
              </span>
            </Link>
          ))}
        </div>
        {analysis.category === "BGFD" && Boolean(analysis.subcategories?.length) && (
          <div className="mt-5 border-t pt-4">
            <p className="mb-2 text-sm font-semibold">BGFD Dolap Alt Kategorileri</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {analysis.subcategories?.map((item) => (
                <div key={item.label} className="rounded-lg bg-muted px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-lg font-semibold tabular-nums">{item.count}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
