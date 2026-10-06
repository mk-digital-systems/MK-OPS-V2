import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants/brand";
import { SOLUTIONS } from "@/lib/constants/solutions";

const PUBLIC_PAGES = ["", "/cozumler", ...SOLUTIONS.map((item) => `/cozumler/${item.slug}`), "/kilavuz", "/register", "/login", "/gizlilik-politikasi", "/kullanim-sartlari", "/iptal-ve-iade"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path.startsWith("/cozumler") ? 0.8 : 0.5,
  }));
}
