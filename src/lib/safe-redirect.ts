/**
 * Giriş ve e-posta bağlantısı sonrası yönlendirmeler için tek, merkezi doğrulama.
 * Yalnızca uygulamanın kendi bölümlerine izin verilir; harici adres, "//x", "/\x",
 * "javascript:", "@x", kodlanmış varyantlar ve kontrol karakterleri geri çevrilir.
 */
export const SAFE_REDIRECT_PREFIXES = [
  "/panel",
  "/admin",
  "/onboarding",
  "/subscription",
  "/pending-approval",
  "/update-password",
] as const;

export const DEFAULT_REDIRECT = "/panel";

const PLACEHOLDER_ORIGIN = "https://yonlendirme.invalid";

function hasUnsafeChars(value: string): boolean {
  return value.includes("\\") || /[\u0000-\u001f\u007f\u0080-\u009f]/.test(value);
}

export function safeNextPath(value: string | null | undefined, fallback: string = DEFAULT_REDIRECT): string {
  if (!value) return fallback;
  const raw = value.trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;

  // Kodlama katmanlarını açıp her aşamada kontrol et (%2f%2f, %5c, %0d ...).
  let current = raw;
  for (let i = 0; i < 4; i++) {
    if (hasUnsafeChars(current) || current.startsWith("//") || !current.startsWith("/")) return fallback;
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return fallback;
    }
    if (decoded === current) break;
    current = decoded;
  }

  let url: URL;
  try {
    url = new URL(raw, PLACEHOLDER_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return fallback;

  const allowed = SAFE_REDIRECT_PREFIXES.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
  return allowed ? `${url.pathname}${url.search}${url.hash}` : fallback;
}
