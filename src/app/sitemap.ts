import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants/brand";
import { SOLUTIONS } from "@/lib/constants/solutions";
import { KVKK_DOCUMENTS } from "@/lib/constants/legal";

const SEO_PAGES = [
  "/santiye-takip-programi",
  "/cok-subeli-santiye-yonetimi",
  "/taseron-takibi",
  "/santiye-yakit-takibi",
  "/karsilastirma/excel-mi-bagli-sistem-mi",
  "/ucretsiz-sablonlar/puantaj-excel-sablonu",
];

const PUBLIC_PAGES = ["", "/cozumler", ...SOLUTIONS.map((item) => `/cozumler/${item.slug}`), ...SEO_PAGES, "/kilavuz", "/kvkk", ...KVKK_DOCUMENTS.map((doc) => doc.href).filter((href) => href.startsWith("/kvkk/")), "/gizlilik-politikasi", "/kullanim-sartlari", "/iptal-ve-iade"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path === "/santiye-takip-programi" ? 0.9 : path.startsWith("/cozumler") || SEO_PAGES.includes(path) ? 0.8 : 0.5,
  }));
}
