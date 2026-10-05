"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Copy, Download, Pencil, Share2, X } from "lucide-react";
import { toast } from "sonner";
import type { DailyWorkPlanWithTeams } from "@/types/work-plan";
import { buildWhatsAppText } from "@/modules/work-plans/whatsapp-formatter";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/layout/brand-logo";
import { WorkPlanTeamTable } from "@/components/work-plans/work-plan-team-table";
import { WorkPlanAbsences } from "@/components/work-plans/work-plan-absences";

type Props = {
  plan: DailyWorkPlanWithTeams;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onShared?: () => void | Promise<void>;
};

export function WhatsAppPreview({ plan, open, onClose, onEdit, onShared }: Props) {
  const posterRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const text = useMemo(() => buildWhatsAppText(plan), [plan]);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Metin panoya kopyalandı");
    } catch {
      toast.error("Kopyalanamadı");
    }
  }

  async function createImageBlob(): Promise<Blob | null> {
  if (!posterRef.current) return null;

  const source = posterRef.current;

  // Poster'in görünmez bir kopyasını oluştur
  const clone = source.cloneNode(true) as HTMLDivElement;

  const wrapper = document.createElement("div");

  wrapper.style.position = "fixed";
  wrapper.style.left = "-10000px";
  wrapper.style.top = "0";
  wrapper.style.width = "900px";
  wrapper.style.backgroundColor = "#ffffff";
  wrapper.style.pointerEvents = "none";
  wrapper.style.zIndex = "-9999";

  clone.style.width = "900px";
  clone.style.minWidth = "900px";
  clone.style.maxWidth = "900px";
  clone.style.height = "auto";
  clone.style.overflow = "visible";
  clone.style.boxSizing = "border-box";

  wrapper.appendChild(clone);
  document.body.appendChild(wrapper);

  try {
    // Fontların ve 900px layout'un tamamen hesaplanmasını bekle
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve());
      });
    });

    const width = 900;
    const height = clone.scrollHeight;

    const dataUrl = await toPng(clone, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      width,
      height,
      style: {
        width: "900px",
        minWidth: "900px",
        maxWidth: "900px",
        height: `${height}px`,
        overflow: "visible",
        boxSizing: "border-box",
      },
    });

    const res = await fetch(dataUrl);
    return await res.blob();
  } finally {
    wrapper.remove();
  }
}

  async function handleDownload() {
    try {
      setSharing(true);

      const blob = await createImageBlob();

      if (!blob) {
        throw new Error("blob");
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");

      a.href = url;
      a.download = `gunluk-is-plani-${plan.plan_date}.png`;

      a.click();

      URL.revokeObjectURL(url);

      toast.success("Görsel indirildi");
    } catch {
      toast.error("Görsel oluşturulamadı");
    } finally {
      setSharing(false);
    }
  }

  async function handleShare() {
    try {
      setSharing(true);

      const blob = await createImageBlob();

      if (!blob) {
        throw new Error("blob");
      }

      const file = new File(
        [blob],
        `AZG-gunluk-is-plani-${plan.plan_date}.png`,
        {
          type: "image/png",
        }
      );

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: "AZG İletişim Merkez Günlük İş Planı",
          text: `AZG iletişim Merkez Günlük İş Planı — ${plan.plan_date}`,
        });
        await onShared?.();
        return;
      }

      if (navigator.share) {
        await navigator.share({
          title: "AZG İletişim Merkez Günlük İş Planı",
          text,
        });
        await onShared?.();
        return;
      }

      await navigator.clipboard.writeText(text);

      toast.message("Doğrudan paylaşım desteklenmiyor", {
        description:
          "Metin panoya kopyalandı. Görsel indirip WhatsApp’tan gönderebilirsiniz.",
      });
    } catch (error) {
      if ((error as Error)?.name === "AbortError") return;

      toast.error("Paylaşım başarısız");
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
      {/* ÜST BAR */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="text-sm font-semibold">WhatsApp Önizleme</p>

          <p className="text-xs text-muted-foreground">
            {formatDate(plan.plan_date)}
          </p>
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          aria-label="Kapat"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* İÇERİK */}
      <div className="min-w-0 flex-1 overflow-auto p-2 sm:p-4">
        <div className="mx-auto min-w-0 max-w-3xl space-y-4">
          {/* PNG OLARAK ALINACAK ALAN */}
          <div
            ref={posterRef}
            className="w-full min-w-0 overflow-hidden rounded-2xl border bg-white p-3 text-[#111111] shadow-sm sm:p-5"
          >
            {/* BAŞLIK */}
            <div className="mb-3 grid grid-cols-[56px_1fr_auto] items-center gap-3 border-2 border-b-0 border-[#000000] bg-[#999999] px-3 py-2.5 text-[#111111]">
              <BrandLogo size={42} />
              <div>
                <p className="text-[15px] font-extrabold tracking-wide">
                  ÇANAKKALE / MERKEZ
                </p>
                <p className="mt-0.5 text-[11px] font-semibold tracking-wide text-[#111111]">
                  GÜNLÜK İŞ PLANI
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#111111]">
                  Plan Tarihi
                </p>
                <p className="mt-0.5 text-[15px] font-extrabold">
                  {formatDate(plan.plan_date, {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {/* EKİPLER */}
            <WorkPlanTeamTable teams={plan.teams} />
            <WorkPlanAbsences absences={plan.absences} poster />
          </div>

          {/* METİN ÖNİZLEME */}
          <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border bg-muted/40 p-4 text-xs leading-relaxed">
            {text}
          </pre>
        </div>
      </div>

      {/* ALT BUTONLAR */}
      <div className="border-t bg-background p-4">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
          <Button variant="outline" onClick={onClose}>
            Geri Dön
          </Button>

          <Button variant="outline" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            Düzenle
          </Button>

          <Button variant="outline" onClick={handleCopy}>
            <Copy className="h-4 w-4" />
            Kopyala
          </Button>

          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={sharing}
          >
            <Download className="h-4 w-4" />
            Görsel Olarak İndir
          </Button>

          <Button onClick={handleShare} disabled={sharing}>
            <Share2 className="h-4 w-4" />
            WhatsApp&apos;ta Paylaş
          </Button>
        </div>
      </div>
    </div>
  );
}
