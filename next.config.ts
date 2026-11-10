import type { NextConfig } from "next";

// Panel /panel altına taşındı; eski yer imleri ve paylaşılan bağlantılar çalışmaya devam eder.
const MOVED_PANEL_ROUTES = [
  "projects",
  "work-plans",
  "personnel",
  "attendance",
  "vehicles",
  "inventory",
  "custody",
  "imalatlar",
  "archive",
  "cancelled-projects",
  "search",
  "settings",
  "users",
  "profile",
  "notes",
  "support",
];

// Tam bir CSP (GA/Ads/inline betikler yüzünden) ayrıca ele alınacak; burada güvenli, kırmayan başlıklar var.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return MOVED_PANEL_ROUTES.flatMap((route) => [
      { source: `/${route}`, destination: `/panel/${route}`, permanent: false },
      { source: `/${route}/:path*`, destination: `/panel/${route}/:path*`, permanent: false },
    ]);
  },
};

export default nextConfig;
