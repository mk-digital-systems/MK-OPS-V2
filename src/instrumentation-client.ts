import { sentryEnabled, sentryOptions, scrubBreadcrumb, scrubEvent } from "@/lib/sentry-options";

/**
 * Tarayıcı tarafı hata izleme. NEXT_PUBLIC_SENTRY_DSN tanımlı değilse SDK hiç indirilmez.
 * Next.js yalnızca bu düz biçimdeki erişimi derleme sırasında istemciye gömer.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (sentryEnabled(dsn)) {
  void import("@sentry/nextjs").then((Sentry) => {
    Sentry.init({
      ...sentryOptions(dsn as string, process.env.NEXT_PUBLIC_VERCEL_ENV, process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA),
      beforeSend: (event) => scrubEvent(event),
      beforeBreadcrumb: (crumb) => scrubBreadcrumb(crumb),
    });
  });
}
