import Link from "next/link";
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { shouldShowSetupGuide, type SetupStep } from "@/lib/setup-guide";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function SetupGuide({ steps }: { steps: SetupStep[] }) {
  if (!shouldShowSetupGuide(steps)) return null;
  const doneCount = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <Rocket className="h-5 w-5 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">İlk kurulum rehberi</h2>
            <p className="text-sm text-muted-foreground">
              {doneCount} / {steps.length} adım tamamlandı. Veriyi girdikçe adımlar kendiliğinden işaretlenir; hepsi bitince bu kutu kaybolur.
            </p>
          </div>
          {next && (
            <Button asChild size="sm">
              <Link href={next.href}>{next.action}</Link>
            </Button>
          )}
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={doneCount}
          aria-label="Kurulum ilerlemesi"
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <ol className="grid gap-2 md:grid-cols-2">
          {steps.map((step) => (
            <li key={step.key} className="flex gap-3 rounded-xl border bg-background p-3">
              {step.done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-label="Tamamlandı" />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-label="Bekliyor" />
              )}
              <div className="min-w-0 flex-1">
                <p className={step.done ? "text-sm font-medium text-muted-foreground line-through" : "text-sm font-medium"}>{step.title}</p>
                {!step.done && (
                  <>
                    <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                    <Link href={step.href} className="mt-1 inline-block text-xs font-medium text-primary underline">
                      {step.action}
                    </Link>
                  </>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
