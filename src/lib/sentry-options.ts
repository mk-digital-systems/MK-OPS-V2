/**
 * Hata izleme (Sentry) ayarları ve gizlilik filtresi. Saf mantık: bilerek içe aktarma yok, birim test edilebilir.
 *
 * - DSN (NEXT_PUBLIC_SENTRY_DSN) yoksa hiçbir şey başlatılmaz: uygulama eskisi gibi çalışır.
 * - DSN gizli değildir (istemciye gömülür); asıl koruma Sentry projesindeki izinlerdir.
 * - KVKK: kullanıcı, çerez, istek gövdesi/başlıkları, sorgu parametreleri gönderilmez; hata metinlerindeki
 *   e-posta ve uzun rakam dizileri (TC kimlik, telefon, IBAN, plaka içeren kayıtlar) maskelenir.
 */

export function sentryEnabled(dsn: string | null | undefined): boolean {
  return typeof dsn === "string" && /^https:\/\/\S+@\S+\/\d+$/.test(dsn.trim());
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LONG_DIGITS = /\d{9,}/g;

/** E-posta ve 9+ haneli rakam dizilerini maskeler (TC kimlik no, telefon, IBAN parçası). */
export function maskSensitive(text: string): string {
  return text.replace(EMAIL, "[e-posta]").replace(LONG_DIGITS, "[sayı]");
}

const stripQuery = (url: string) => url.split("?")[0].split("#")[0];

type Loose = Record<string, unknown>;
type SentryEventLike = {
  user?: unknown;
  message?: string;
  request?: Loose & { url?: string };
  exception?: { values?: { value?: string }[] };
  extra?: unknown;
  contexts?: unknown;
  breadcrumbs?: unknown[];
};

export function scrubEvent<T extends object>(input: T): T {
  const event = input as SentryEventLike;
  delete event.user;
  delete event.extra;
  if (event.request) {
    const { url } = event.request;
    event.request = typeof url === "string" ? { url: stripQuery(url) } : {};
  }
  if (typeof event.message === "string") event.message = maskSensitive(event.message);
  for (const value of event.exception?.values ?? []) {
    if (typeof value.value === "string") value.value = maskSensitive(value.value);
  }
  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs
      .map((crumb) => scrubBreadcrumb(crumb as object))
      .filter((crumb): crumb is object => crumb !== null);
  }
  return input;
}

type BreadcrumbLike = { category?: string; message?: string; data?: Loose & { url?: string } };

/** Konsol kayıtlarını atar; ağ isteklerinde yalnızca yöntem/durum/adres (sorgusuz) kalır. */
export function scrubBreadcrumb<T extends object>(input: T): T | null {
  const crumb = input as BreadcrumbLike;
  if (crumb.category === "console") return null;
  if (crumb.category === "fetch" || crumb.category === "xhr") {
    const data = crumb.data ?? {};
    return {
      ...crumb,
      data: {
        method: data.method,
        status_code: data.status_code,
        url: typeof data.url === "string" ? stripQuery(data.url) : undefined,
      },
    } as T;
  }
  if (typeof crumb.message === "string") return { ...crumb, message: maskSensitive(crumb.message) } as T;
  return input;
}

/** Kullanıcının internet/tarayıcı kaynaklı, bizim hatamız olmayan gürültüsü. */
export const IGNORED_ERRORS = [
  "ResizeObserver loop",
  "Failed to fetch",
  "Load failed",
  "NetworkError",
  "AbortError",
  "Non-Error promise rejection captured",
];

export function sentryOptions(dsn: string, env: string | undefined, release: string | undefined) {
  return {
    dsn,
    environment: env || "production",
    release: release || undefined,
    sendDefaultPii: false,
    // Yalnızca hatalar: performans izleme ve oturum kaydı yok.
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,
    ignoreErrors: IGNORED_ERRORS,
    denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//],
  };
}
