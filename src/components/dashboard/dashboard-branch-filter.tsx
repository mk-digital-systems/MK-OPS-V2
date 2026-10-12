"use client";

import { cn } from "@/lib/utils";
import { useBranches } from "@/components/layout/branch-provider";

/** Genel Bakış: bütün şubeler veya tek şube (menüdeki şube seçimiyle aynı). */
export function DashboardBranchFilter() {
  const { branches, selectedId, select } = useBranches();
  if (branches.length < 2) return null;
  const options = [{ id: null as string | null, name: "Tüm Şubeler" }, ...branches.map((branch) => ({ id: branch.id as string | null, name: branch.name }))];
  return (
    <div className="flex flex-wrap gap-2" aria-label="Şube">
      {options.map((option) => (
        <button
          key={option.id ?? "all"}
          type="button"
          onClick={() => select(option.id)}
          aria-pressed={selectedId === option.id}
          className={cn(
            "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
            selectedId === option.id
              ? "border-primary bg-primary text-primary-foreground"
              : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
          )}
        >
          {option.name}
        </button>
      ))}
    </div>
  );
}
