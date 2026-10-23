export const GA4_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "";
export const GOOGLE_ADS_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";

export type MeasurementConsentChoice = "granted" | "denied";

type GtagValue = string | number | boolean | Date | undefined;
type GtagParameters = Record<string, GtagValue>;
type GtagFunction = (command: string, targetOrAction?: string | Date | GtagParameters, parameters?: GtagParameters) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFunction;
    __mkOpsConsentDefaultsSet?: boolean;
    __mkOpsGoogleTagConfigured?: boolean;
  }
}

const CONSENT_STORAGE_KEY = "mk_ops_measurement_consent_v1";
const CONSENT_VERSION = 1;
const CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const GOOGLE_TAG_SCRIPT_ID = "mk-ops-google-tag";
const SIGNUP_DEDUP_PREFIX = "mk_ops_ads_signup_sent:";

const GA4_ID_PATTERN = /^G-[A-Z0-9]+$/;
const GOOGLE_ADS_ID_PATTERN = /^AW-\d+$/;
const MEASUREMENT_COOKIE_PREFIXES = ["_ga", "_gid", "_gat", "_gcl_", "_gac_"];
const ATTRIBUTION_QUERY_KEYS = new Set(["gclid", "gbraid", "wbraid", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]);

export const measurementConfigurationValid =
  GA4_ID_PATTERN.test(GA4_MEASUREMENT_ID) && GOOGLE_ADS_ID_PATTERN.test(GOOGLE_ADS_ID);

function ensureGtag(): GtagFunction | null {
  if (typeof window === "undefined") return null;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? ((...args: unknown[]) => {
    window.dataLayer?.push(args);
  }) as GtagFunction;
  return window.gtag;
}

function consentValues(choice: MeasurementConsentChoice) {
  const granted = choice === "granted" ? "granted" : "denied";
  return {
    analytics_storage: granted,
    ad_storage: granted,
    ad_user_data: granted,
    ad_personalization: "denied",
  };
}

export function initializeConsentDefaults(): void {
  if (typeof window === "undefined" || window.__mkOpsConsentDefaultsSet) return;
  const gtag = ensureGtag();
  if (!gtag) return;
  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  window.__mkOpsConsentDefaultsSet = true;
}

export function readMeasurementConsent(): MeasurementConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as { version?: number; choice?: string; updatedAt?: string };
    const updatedAt = Date.parse(stored.updatedAt ?? "");
    if (
      stored.version !== CONSENT_VERSION ||
      (stored.choice !== "granted" && stored.choice !== "denied") ||
      !Number.isFinite(updatedAt) ||
      Date.now() - updatedAt > CONSENT_MAX_AGE_MS
    ) {
      window.localStorage.removeItem(CONSENT_STORAGE_KEY);
      return null;
    }
    return stored.choice;
  } catch {
    return null;
  }
}

export function storeMeasurementConsent(choice: MeasurementConsentChoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({
      version: CONSENT_VERSION,
      choice,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    // Depolama kapalıysa tercih yalnızca geçerli sayfa oturumunda uygulanır.
  }
}

function setGaDisabled(disabled: boolean): void {
  if (typeof window === "undefined" || !GA4_MEASUREMENT_ID) return;
  (window as unknown as Record<string, unknown>)[`ga-disable-${GA4_MEASUREMENT_ID}`] = disabled;
}

function loadGoogleTagScript(): void {
  if (typeof document === "undefined" || document.getElementById(GOOGLE_TAG_SCRIPT_ID)) return;
  const script = document.createElement("script");
  script.id = GOOGLE_TAG_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_MEASUREMENT_ID)}`;
  document.head.appendChild(script);
}

export function activateGoogleTag(): boolean {
  if (!measurementConfigurationValid || typeof window === "undefined") return false;
  initializeConsentDefaults();
  const gtag = ensureGtag();
  if (!gtag) return false;

  setGaDisabled(false);
  gtag("consent", "update", consentValues("granted"));

  if (!window.__mkOpsGoogleTagConfigured) {
    gtag("js", new Date());
    gtag("set", {
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    gtag("config", GA4_MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    gtag("config", GOOGLE_ADS_ID, {
      send_page_view: false,
      allow_ad_personalization_signals: false,
    });
    window.__mkOpsGoogleTagConfigured = true;
  }

  loadGoogleTagScript();
  return true;
}

function cookieDomains(): Array<string | null> {
  if (typeof window === "undefined") return [null];
  const hostname = window.location.hostname;
  const parts = hostname.split(".").filter(Boolean);
  const parent = parts.length >= 2 ? `.${parts.slice(-2).join(".")}` : null;
  return [null, hostname, parent].filter((value, index, values) => values.indexOf(value) === index);
}

function clearMeasurementCookies(): void {
  if (typeof document === "undefined") return;
  const names = document.cookie
    .split(";")
    .map((item) => item.split("=", 1)[0]?.trim())
    .filter((name): name is string => Boolean(name) && MEASUREMENT_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix)));

  for (const name of names) {
    for (const domain of cookieDomains()) {
      const domainPart = domain ? `; domain=${domain}` : "";
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainPart}; SameSite=Lax`;
    }
  }
}

function clearMeasurementLocalStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("_gcl_ls");
  } catch {
    // Tarayıcı depolaması kapalı olabilir.
  }
}

export function deactivateGoogleTag(): void {
  if (typeof window === "undefined") return;
  initializeConsentDefaults();
  ensureGtag()?.("consent", "update", consentValues("denied"));
  setGaDisabled(true);
  clearMeasurementCookies();
  clearMeasurementLocalStorage();
}

function trackGa4Event(name: string, parameters: GtagParameters = {}): boolean {
  if (!measurementConfigurationValid || readMeasurementConsent() !== "granted") return false;
  const gtag = ensureGtag();
  if (!gtag) return false;
  gtag("event", name, { ...parameters, send_to: GA4_MEASUREMENT_ID });
  return true;
}

function sanitizedPageLocation(): string {
  const url = new URL(window.location.href);
  const clean = new URL(url.pathname, url.origin);
  for (const [key, value] of url.searchParams) {
    if (ATTRIBUTION_QUERY_KEYS.has(key.toLowerCase())) clean.searchParams.append(key, value);
  }
  return clean.toString();
}

export function trackPageView(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  return trackGa4Event("page_view", {
    page_title: document.title,
    page_location: sanitizedPageLocation(),
    page_path: window.location.pathname,
  });
}

export function trackWhatsAppConversion(): boolean {
  return trackGa4Event("ads_conversion_whatsapp");
}

export function trackSignupConversion(companyId: string): boolean {
  if (typeof window === "undefined" || !companyId || readMeasurementConsent() !== "granted") return false;
  const key = `${SIGNUP_DEDUP_PREFIX}${companyId}`;
  try {
    if (window.localStorage.getItem(key) === "1") return false;
  } catch {
    // Depolama kapalı olsa da başarılı işlem aynı çağrıda yalnızca bir kez gönderilir.
  }
  if (!trackGa4Event("ads_conversion_signup")) return false;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Dönüşüm gönderildi; depolama kapalıysa kalıcı tekilleştirme yapılamaz.
  }
  return true;
}
