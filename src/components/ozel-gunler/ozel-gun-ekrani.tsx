"use client";

import { useEffect, useState } from "react";
import { OZEL_GUNLER } from "@/lib/ozel-gunler";
import { aralikta, gordumAnahtari, saatliGosterimBitisi, type OzelGun } from "@/lib/ozel-gunler/schedule";

type Gosterim = { gun: OzelGun; mod: "ilk" | "saatli"; bitis: number };

function gordu(gun: OzelGun): boolean {
  try {
    return localStorage.getItem(gordumAnahtari(gun, Date.now())) === "seen";
  } catch {
    return false;
  }
}

function gorduIsaretle(gun: OzelGun) {
  try {
    localStorage.setItem(gordumAnahtari(gun, Date.now()), "seen");
  } catch {
    /* Depolama kapalıysa ekran yine çalışır. */
  }
}

/**
 * Özel gün ekranı (tam ekran, masaüstü ve mobil görsel); her sayfada çalışır, her yıl tekrarlanır.
 * - Günün aralığında siteye ilk girişte kısa süre gösterilir ("Geç" ile kapatılabilir).
 * - Saatli gösterimi olan günlerde o saatte, kullanıcı hangi sayfada olursa olsun süre boyunca
 *   gösterilir; bu sürede kapatılamaz.
 * - Önizleme: adrese `?ozelgun=<id>` (örn. `?ozelgun=10-kasim`) ekleyin; saat denetimi atlanır, kayıt tutulmaz.
 */
export function OzelGunEkrani() {
  const [gosterim, setGosterim] = useState<Gosterim | null>(null);

  useEffect(() => {
    const onizlemeId = new URLSearchParams(window.location.search).get("ozelgun");
    let current: Gosterim | null = null;

    if (onizlemeId) {
      const gun = OZEL_GUNLER.find((g) => g.id === onizlemeId);
      if (!gun) return;
      current = { gun, mod: "ilk", bitis: Date.now() + gun.ilkGirisMs };
      setGosterim(current);
    }

    function tick() {
      const now = Date.now();
      if (onizlemeId) {
        if (current && now >= current.bitis) {
          current = null;
          setGosterim(null);
        }
        return;
      }

      // Saatli gösterim her şeyin önüne geçer: başka sayfada olsa da herkesin ekranında belirir.
      for (const gun of OZEL_GUNLER) {
        const bitis = saatliGosterimBitisi(gun, now);
        if (bitis === null) continue;
        if (current?.gun.id !== gun.id || current.mod !== "saatli") {
          current = { gun, mod: "saatli", bitis };
          gorduIsaretle(gun);
          setGosterim(current);
        }
        return;
      }

      if (current && now >= current.bitis) {
        current = null;
        setGosterim(null);
      }
      if (current) return;

      const gun = OZEL_GUNLER.find((g) => aralikta(g, now) && !gordu(g));
      if (gun) {
        current = { gun, mod: "ilk", bitis: now + gun.ilkGirisMs };
        gorduIsaretle(gun);
        setGosterim(current);
      }
    }

    tick();
    const interval = window.setInterval(tick, 500);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const mod = gosterim?.mod;
  const bitis = gosterim?.bitis;

  useEffect(() => {
    if (!mod) return;
    const onceki = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = onceki;
    };
  }, [mod]);

  useEffect(() => {
    if (mod !== "ilk") return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setGosterim(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mod]);

  if (!gosterim || !bitis) return null;
  const { gun } = gosterim;
  const kalanMs = Math.max(0, bitis - Date.now());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={gun.ad}
      className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black"
    >
      <picture className="absolute inset-0 block h-full w-full">
        <source media="(max-width: 720px), (orientation: portrait)" srcSet={gun.gorsel.mobil} />
        <img src={gun.gorsel.masaustu} alt={gun.gorsel.alt} className="h-full w-full object-contain" />
      </picture>

      {mod === "ilk" && (
        <button
          type="button"
          onClick={() => setGosterim(null)}
          className="absolute right-4 top-4 rounded-full border border-white/35 bg-black/50 px-4 py-2 text-sm text-white backdrop-blur hover:bg-white/20"
        >
          Geç
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 h-1 bg-white/15" aria-hidden="true">
        <span
          key={`${gun.id}-${mod}-${bitis}`}
          className="block h-full origin-left bg-white/80"
          style={{ animation: `ozel-gun-geri-sayim ${kalanMs}ms linear forwards` }}
        />
      </div>
      <style>{`@keyframes ozel-gun-geri-sayim{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
    </div>
  );
}
