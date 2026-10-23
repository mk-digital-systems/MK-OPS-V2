"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";
import { SUPPORT_WHATSAPP } from "@/lib/constants/brand";
import {
  activateGoogleTag,
  deactivateGoogleTag,
  initializeConsentDefaults,
  measurementConfigurationValid,
  readMeasurementConsent,
  storeMeasurementConsent,
  trackPageView,
  trackWhatsAppConversion,
  type MeasurementConsentChoice,
} from "@/lib/analytics";
import { Button } from "@/components/ui/button";

const MARKETING_PATHS = new Set([
  "/",
  "/cozumler",
  "/santiye-takip-programi",
  "/cok-subeli-santiye-yonetimi",
  "/taseron-takibi",
  "/santiye-yakit-takibi",
  "/karsilastirma/excel-mi-bagli-sistem-mi",
  "/ucretsiz-sablonlar/puantaj-excel-sablonu",
]);

function isMarketingPath(pathname: string): boolean {
  return MARKETING_PATHS.has(pathname) || pathname.startsWith("/cozumler/");
}

function shouldTrackPageView(pathname: string): boolean {
  return !pathname.startsWith("/panel") && !pathname.startsWith("/admin");
}

function isSupportWhatsAppLink(anchor: HTMLAnchorElement): boolean {
  try {
    const url = new URL(anchor.href);
    return url.hostname.toLowerCase() === "wa.me" && url.pathname.replace(/^\/+|\/+$/g, "") === SUPPORT_WHATSAPP;
  } catch {
    return false;
  }
}

export function MeasurementProvider() {
  const pathname = usePathname();
  const [choice, setChoice] = useState<MeasurementConsentChoice | null | undefined>(undefined);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [tagActive, setTagActive] = useState(false);
  const lastPageView = useRef("");

  useEffect(() => {
    if (!measurementConfigurationValid) return;
    initializeConsentDefaults();
    const stored = readMeasurementConsent();
    setChoice(stored);
    if (stored === "granted") setTagActive(activateGoogleTag());
    if (stored === "denied") deactivateGoogleTag();
  }, []);

  useEffect(() => {
    if (!tagActive || !shouldTrackPageView(pathname)) return;
    const key = `${pathname}${window.location.search}`;
    if (lastPageView.current === key) return;
    if (trackPageView()) lastPageView.current = key;
  }, [pathname, tagActive]);

  useEffect(() => {
    if (!tagActive || !isMarketingPath(pathname)) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (anchor && isSupportWhatsAppLink(anchor)) trackWhatsAppConversion();
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname, tagActive]);

  if (!measurementConfigurationValid || choice === undefined) return null;

  const setConsent = (nextChoice: MeasurementConsentChoice) => {
    storeMeasurementConsent(nextChoice);
    setChoice(nextChoice);
    setPreferencesOpen(false);
    if (nextChoice === "granted") {
      setTagActive(activateGoogleTag());
      return;
    }
    deactivateGoogleTag();
    setTagActive(false);
    lastPageView.current = "";
  };

  const showCard = choice === null || preferencesOpen;

  return (
    <>
      {showCard ? (
        <section
          role="dialog"
          aria-modal="false"
          aria-labelledby="measurement-consent-title"
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-xl rounded-2xl border bg-background/95 p-4 shadow-xl backdrop-blur sm:bottom-5 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <Cookie className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 id="measurement-consent-title" className="text-sm font-semibold">Analitik ve reklam ölçümü</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">
                Zorunlu olmayan ölçüm teknolojilerini yalnızca izninizle kullanırız. Kişiselleştirilmiş reklam ve remarketing kullanmayız. {" "}
                <Link href="/kvkk/cerez-politikasi" className="underline underline-offset-2">Çerez Politikası</Link>
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setConsent("denied")}>Reddet</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setConsent("granted")}>Kabul Et</Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="fixed bottom-3 left-3 z-[90] h-8 bg-background/90 px-2 text-xs shadow-sm backdrop-blur"
          onClick={() => setPreferencesOpen(true)}
        >
          <Cookie className="h-3.5 w-3.5" aria-hidden="true" />
          Çerez tercihleri
        </Button>
      )}
    </>
  );
}
