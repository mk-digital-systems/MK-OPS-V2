import Link from "next/link";
import type { ProjectType } from "@/types/project";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TypeDot } from "@/components/projects/project-status-indicators";

const SCREEN_NOTES: Record<ProjectType["screen"], string> = {
  standard: "İş kalemleri imalatta Poz Listesi'nden seçilir; keşif isteğe bağlı.",
  hp: "Paftalar ve HP adetleriyle takip edilir; imalatta pozlar ve isteğe bağlı pafta.",
  corporate: "Durum ve ekip başı elle seçilir; imalatta pozlar.",
};

/** Firmanın proje türleri (salt okunur): türler MK OPS tarafından katalogdan kurulur. */
export function ProjectTypesManager({ types }: { types: ProjectType[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Proje Türleri</CardTitle>
        <CardDescription>
          Proje türleri firmanızın sektörüne göre MK OPS tarafından kurulur. Yeni bir tür gerekiyorsa{" "}
          <Link href="/panel/support" className="font-medium text-primary underline">
            Destek
          </Link>{" "}
          sayfasından bize yazın. İş kalemleri ve fiyatlar{" "}
          <Link href="/panel/poz-listesi" className="font-medium text-primary underline">
            Poz Listesi
          </Link>
          &apos;ndedir.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {types.length === 0 && (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            Henüz proje türü kurulmamış. Destek sayfasından bize yazın.
          </div>
        )}
        {types.map((type) => (
          <div key={type.id} className={cn("rounded-xl border p-4", type.is_archived && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-2">
              <TypeDot color={type.color} />
              <p className="font-semibold">{type.name}</p>
              {type.is_archived && <span className="rounded-md bg-muted px-2 py-0.5 text-xs">Arşivde</span>}
            </div>
            {type.description && <p className="mt-1 text-sm text-muted-foreground">{type.description}</p>}
            <p className="mt-2 text-xs text-muted-foreground">{SCREEN_NOTES[type.screen]}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
