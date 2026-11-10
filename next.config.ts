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

// CSP yalnızca RAPOR modunda (engellemez): tarayıcı konsolunda ihlalleri gösterir. Üretimde bir süre
// izlenip ihlal kalmadığında "Content-Security-Policy" olarak zorunlu hale getirilecek.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://googleads.g.doubleclick.net https://www.googleadservices.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://www.google-analytics.com https://www.googletagmanager.com https://googleads.g.doubleclick.net https://www.google.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://stats.g.doubleclick.net https://www.googletagmanager.com https://googleads.g.doubleclick.net",
  "frame-src https://www.googletagmanager.com https://td.doubleclick.net",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

// Zorunlu başlıklar (uygulamayı bozmayan olanlar). Tam CSP için yukarıdaki Report-Only politikaya bakın.
const SECURITY_HEADERS = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
  { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
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
