/**
 * Süper admin iki adımlı doğrulama (TOTP) yardımcıları. Saf mantık: bilerek içe aktarma yok, birim test edilebilir.
 * Asıl zorlama veritabanındadır (is_super_admin() aal2 ister); buradaki yönlendirme kullanıcıyı doğru ekrana taşır.
 */

export const MFA_VERIFY_PATH = "/mfa-dogrulama";

/** Oturum düzeyi: kullanıcının doğrulanmış faktörü var (nextLevel aal2) ama oturum henüz aal1. */
export type AalLevels = { currentLevel?: string | null; nextLevel?: string | null } | null | undefined;

export function needsMfaStep(levels: AalLevels): boolean {
  return levels?.currentLevel === "aal1" && levels?.nextLevel === "aal2";
}

/** Yalnızca uygulamanın giriş yapılmış bölümleri; tanıtım sayfaları, giriş ve API etkilenmez. */
const APP_AREAS = ["/panel", "/admin", "/onboarding", "/subscription", "/pending-approval"];

export function shouldRedirectToMfa(pathname: string, method: string, levels: AalLevels): boolean {
  if (method !== "GET" && method !== "HEAD") return false;
  if (!needsMfaStep(levels)) return false;
  return APP_AREAS.some((area) => pathname === area || pathname.startsWith(`${area}/`));
}

export function mfaVerifyHref(pathname: string, search = ""): string {
  return `${MFA_VERIFY_PATH}?next=${encodeURIComponent(`${pathname}${search}`)}`;
}

/** Kullanıcı boşluk/tire ile yazabilir: "123 456" → "123456". */
export function normalizeTotp(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function isTotpCode(value: string): boolean {
  return /^\d{6}$/.test(normalizeTotp(value));
}

/** Supabase MFA hata metinlerini kullanıcıya anlaşılır Türkçeye çevirir. */
export function mfaErrorMessage(error: unknown): string {
  const text = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  if (/invalid totp|invalid code|code is invalid|verification failed/i.test(text)) {
    return "Kod hatalı veya süresi dolmuş. Doğrulayıcı uygulamadaki güncel 6 haneli kodu girin.";
  }
  if (/too many|rate limit|over_request_rate_limit/i.test(text)) {
    return "Çok fazla deneme yapıldı. Birkaç dakika bekleyip tekrar deneyin.";
  }
  if (/failed to fetch|network/i.test(text)) return "İnternet bağlantısı kurulamadı. Tekrar deneyin.";
  return "İşlem tamamlanamadı. Sayfayı yenileyip tekrar deneyin.";
}
