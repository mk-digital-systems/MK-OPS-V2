import type { MetadataRoute } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/constants/brand";

/**
 * Ana ekrana eklenebilir uygulama (PWA) bildirimi. Bilerek hizmet çalışanı (service worker) ve çevrimdışı
 * önbellek YOK: personel, maaş ve hakediş gibi hassas verilerin cihazda kalıcı önbelleğe alınması
 * ayrıca tasarlanıp onaylanmadan eklenmez.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${APP_NAME} — ${APP_TAGLINE}`,
    short_name: APP_NAME,
    description: `${APP_NAME}: projeler, iş planı, puantaj, hakediş, depo ve araçlar tek panelde.`,
    lang: "tr",
    start_url: "/panel",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1d4ed8",
    icons: [
      { src: "/icon.png", sizes: "192x192", type: "image/png" },
      { src: "/images/logo-mk-ops.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
