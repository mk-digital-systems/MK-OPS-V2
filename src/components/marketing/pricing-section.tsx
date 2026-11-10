"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Mail, MessageCircle } from "lucide-react";
import type { PublicPlanPrice } from "@/types/admin";
import { SUPPORT_EMAIL, whatsappUrl } from "@/lib/constants/brand";
import {
  MONTH_LABELS,
  PLAN_MONTHS,
  branchLimitText,
  formatTl,
  perMonth,
  priceForMonths,
  savingPercent,
  userLimitText,
  type PlanMonths,
} from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const INCLUDED = [
  "Bütün modüller",
  "Excel, Word, PDF çıktılar",
  "Rol ve yetki yönetimi",
  "Mobil uyumlu kullanım",
  "Destek talebi ile yardım",
  "Veriler firmanıza özel",
];

/**
 * Fiyat listesi: veriler süper adminin Fiyat Listesi sayfasından gelir (public_plan_prices).
 * Fiyatlar KDV dahil. Liste boşsa (okunamadıysa) eski "teklif al" görünümü gösterilir.
 */
export function PricingSection({ plans, signedIn }: { plans: PublicPlanPrice[]; signedIn: boolean }) {
  const [months, setMonths] = useState<PlanMonths>(3);
  const priced = plans.filter((plan) => !plan.is_custom);
  const hasList = priced.length > 0;

  return (
    <section id="fiyatlandirma" className="scroll-mt-20 py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight">{hasList ? "Fiyatlandırma" : "Firmanıza özel fiyat"}</h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            {hasList
              ? "Kullanıcı sayınıza göre paketinizi seçin. Fiyatlara KDV dahildir. Önce 48 saat ücretsiz deneyin, sonra karar verin."
              : "Kullanıcı sayınıza ve ihtiyacınıza göre teklif hazırlıyoruz. Önce 48 saat ücretsiz deneyin, sonra karar verin."}
          </p>
        </div>

        {hasList && (
          <>
            <div className="mt-8 flex justify-center">
              <div className="inline-flex gap-1 rounded-xl border bg-background p-1" role="group" aria-label="Ödeme süresi">
                {PLAN_MONTHS.map((value) => {
                  const best = Math.max(...priced.map((plan) => savingPercent(plan, value)));
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setMonths(value)}
                      aria-pressed={months === value}
                      className={cn(
                        "rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                        months === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
                      )}
                    >
                      {MONTH_LABELS[value]}
                      {value > 1 && best > 0 && <span className="ml-1.5 text-xs opacity-80">%{best} indirim</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={cn("mt-8 grid gap-4 sm:grid-cols-2", plans.length >= 4 ? "lg:grid-cols-4" : "lg:grid-cols-3")}>
              {plans.map((plan) => {
                const total = priceForMonths(plan, months);
                const saving = savingPercent(plan, months);
                const message = plan.is_custom
                  ? `MK OPS için özel kurumsal teklif almak istiyorum.`
                  : `MK OPS ${plan.name} planı (${MONTH_LABELS[months]}) için bilgi almak istiyorum.`;
                return (
                  <div key={plan.name} className="flex flex-col rounded-2xl border bg-card p-6 shadow-sm">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{userLimitText(plan)}</p>
                    <div className="mt-5 min-h-[88px]">
                      {plan.is_custom || total === null ? (
                        <p className="text-3xl font-semibold tracking-tight">Özel teklif</p>
                      ) : (
                        <>
                          <p className="text-3xl font-semibold tracking-tight">{formatTl(total)}</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {months === 1 ? "aylık" : `${MONTH_LABELS[months]} toplam · ayda ${formatTl(perMonth(total, months))}`}
                          </p>
                          {saving > 0 && (
                            <p className="mt-1 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                              %{saving} indirim
                            </p>
                          )}
                        </>
                      )}
                    </div>
                    <ul className="mt-4 space-y-2 text-sm">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        {plan.is_custom ? "Firmanıza göre kullanıcı ve şube sayısı" : branchLimitText(plan.branch_limit)}
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        Bütün modüller açık
                      </li>
                    </ul>
                    <Button asChild className="mt-6" variant={plan.is_custom ? "outline" : "default"}>
                      <a href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4" />
                        {plan.is_custom ? "Teklif Al" : "Bu planı iste"}
                      </a>
                    </Button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-10 grid overflow-hidden rounded-2xl border bg-card shadow-sm md:grid-cols-[1.3fr_1fr]">
          <div className="p-8">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary">Her planda</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {INCLUDED.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col justify-center gap-3 border-t bg-muted/40 p-8 md:border-l md:border-t-0">
            <p className="text-sm text-muted-foreground">
              Ödeme EFT/havale ile. 1, 3 veya 6 aylık. Otomatik yenileme yok.{hasList && " Fiyatlara KDV dahildir."}
            </p>
            {!hasList && (
              <>
                <Button asChild size="lg">
                  <a href={whatsappUrl("MK OPS için fiyat teklifi almak istiyorum.")} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4" />
                    Teklif Al
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("MK OPS fiyat teklifi")}`}>
                    <Mail className="h-4 w-4" />
                    E-posta ile sor
                  </a>
                </Button>
              </>
            )}
            {hasList && (
              <Button asChild variant="outline">
                <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("MK OPS plan bilgisi")}`}>
                  <Mail className="h-4 w-4" />
                  E-posta ile sor
                </a>
              </Button>
            )}
            {!signedIn && (
              <Link href="/register" className="text-center text-sm font-medium text-primary hover:underline">
                veya 48 saat ücretsiz deneyin
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
