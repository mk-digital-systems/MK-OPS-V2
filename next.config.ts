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

const nextConfig: NextConfig = {
  async redirects() {
    return MOVED_PANEL_ROUTES.flatMap((route) => [
      { source: `/${route}`, destination: `/panel/${route}`, permanent: false },
      { source: `/${route}/:path*`, destination: `/panel/${route}/:path*`, permanent: false },
    ]);
  },
};

export default nextConfig;
