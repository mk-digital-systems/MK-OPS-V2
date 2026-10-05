import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/constants/brand";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/panel", "/admin", "/onboarding", "/subscription", "/pending-approval", "/auth"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
