import { sentryEnabled, sentryOptions, scrubBreadcrumb, scrubEvent } from "@/lib/sentry-options";

/**
 * Sunucu tarafı hata izleme. NEXT_PUBLIC_SENTRY_DSN tanımlı değilse hiçbir şey yüklenmez.
 * (Kişisel veri filtresi: src/lib/sentry-options.ts)
 */
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!sentryEnabled(dsn)) return;
  const Sentry = await import("@sentry/nextjs");
  Sentry.init({
    ...sentryOptions(dsn as string, process.env.VERCEL_ENV ?? process.env.NODE_ENV, process.env.VERCEL_GIT_COMMIT_SHA),
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
  });
}

export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  if (!sentryEnabled(process.env.NEXT_PUBLIC_SENTRY_DSN)) return;
  const Sentry = await import("@sentry/nextjs");
  return Sentry.captureRequestError(...args);
}
