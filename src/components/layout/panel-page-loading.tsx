import { Skeleton } from "@/components/ui/skeleton";

type PanelPageLoadingProps = {
  summaryCards?: number;
  rows?: number;
  showFilters?: boolean;
};

export function PanelPageLoading({
  summaryCards = 0,
  rows = 5,
  showFilters = true,
}: PanelPageLoadingProps) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Sayfa yükleniyor</span>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-4 w-64 max-w-[70vw]" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      {showFilters ? (
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 min-w-48 flex-1" />
            <Skeleton className="h-10 w-40" />
            <Skeleton className="h-10 w-32" />
          </div>
        </div>
      ) : null}

      {summaryCards > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: summaryCards }, (_, index) => (
            <div key={index} className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-16" />
              <Skeleton className="mt-3 h-3 w-32" />
            </div>
          ))}
        </div>
      ) : null}

      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="mb-5 flex items-center justify-between gap-4">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: rows }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
