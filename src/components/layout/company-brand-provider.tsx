"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_REPORT_BRAND, loadLogoImage, type ReportBrand } from "@/lib/report-brand";

const CompanyBrandContext = createContext<ReportBrand>(DEFAULT_REPORT_BRAND);

export function CompanyBrandProvider({ brand, children }: { brand: ReportBrand; children: React.ReactNode }) {
  return <CompanyBrandContext.Provider value={brand}>{children}</CompanyBrandContext.Provider>;
}

/** Raporlarda kullanılacak firma adı ve logosu. */
export function useReportBrand(): ReportBrand {
  return useContext(CompanyBrandContext);
}

/**
 * Logonun PNG data URL'si. Görsel olarak dışa aktarılan alanlarda (html-to-image)
 * uzak adres yerine bunu kullanmak, logonun çıktıda eksik kalmasını önler.
 */
export function useLogoDataUrl(brand: ReportBrand): string | null {
  const [loaded, setLoaded] = useState<{ url: string; dataUrl: string | null } | null>(null);
  useEffect(() => {
    if (!brand.logoUrl) return;
    let cancelled = false;
    const url = brand.logoUrl;
    void loadLogoImage(url).then((logo) => {
      if (!cancelled) setLoaded({ url, dataUrl: logo?.dataUrl ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [brand.logoUrl]);
  return loaded && loaded.url === brand.logoUrl ? loaded.dataUrl : null;
}

/** Firma logosu varsa logo, yoksa hiçbir şey (ekrandaki rapor önizlemeleri için). */
export function CompanyLogo({ brand, className }: { brand: ReportBrand; className?: string }) {
  if (!brand.logoUrl) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={brand.logoUrl} alt={brand.name} className={className} />;
}
