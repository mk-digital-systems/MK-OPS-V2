"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Clock3 } from "lucide-react";
import type { CompanySummary } from "@/types/auth";
import { SUPPORT_EMAIL } from "@/lib/constants/brand";

function remainingLabel(endsAt: string, now: number) {
  const minutes = Math.max(0, Math.floor((new Date(endsAt).getTime() - now) / 60000));
  if (minutes >= 60) return `${Math.floor(minutes / 60)} saat ${minutes % 60} dakika`;
  return `${minutes} dakika`;
}

export function TrialBanner({ company, canRequestPlan }: { company: CompanySummary; canRequestPlan: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  if (company.access_status !== "trial") return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        Deneme sürümü — kalan süre:{" "}
        <strong>{remainingLabel(company.trial_ends_at, now)}</strong>. Süre
        dolduğunda verileriniz korunur ancak plan atanana kadar panele
        erişilemez.{" "}
        {canRequestPlan ? (
          <Link href="/support?konu=plan" className="font-semibold underline">
            Plan talebi gönderin
          </Link>
        ) : (
          <>
            Plan için{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline">
              {SUPPORT_EMAIL}
            </a>{" "}
            adresine yazın
          </>
        )}
        .
      </p>
    </div>
  );
}
