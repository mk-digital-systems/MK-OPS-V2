import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants/brand";

const PUBLIC_PAGES = ["", "/register", "/login", "/gizlilik-politikasi", "/kullanim-sartlari", "/iptal-ve-iade"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : 0.5,
  }));
}
