/**
 * Cloudflare Turnstile CAPTCHA yardımcıları (saf mantık; bilerek içe aktarma yok, birim test edilebilir).
 *
 * Yalnızca SITE KEY (herkese açık) istemcide kullanılır: NEXT_PUBLIC_TURNSTILE_SITE_KEY.
 * SECRET KEY burada ve repoda yoktur; yalnızca Supabase paneline (Authentication → Attack Protection) girilir.
 */

export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/** Site key tanımlı ve boş değilse CAPTCHA widget'ı gösterilir; değilse giriş akışı eskisi gibi çalışır. */
export function captchaEnabled(siteKey: string | null | undefined): boolean {
  return typeof siteKey === "string" && siteKey.trim().length > 0;
}

/** Supabase Auth çağrılarının `options` alanına açılır: token yoksa hiçbir şey eklenmez. */
export function captchaOptions(token: string | null | undefined): { captchaToken?: string } {
  return typeof token === "string" && token.length > 0 ? { captchaToken: token } : {};
}

/**
 * Gönder düğmesi ne zaman açık?
 * - CAPTCHA kapalıysa her zaman.
 * - Açıksa token alındığında.
 * - Widget yüklenemedi / başlatılamadıysa (reklam engelleyici, alan adı izinli değil) yine açık: Supabase tarafı
 *   CAPTCHA'yı zorunlu tutuyorsa sunucu reddeder ve kullanıcıya açıklayıcı mesaj gösterilir; CAPTCHA kapalıyken
 *   widget sorunu giriş yapmayı engellemez.
 */
export function canSubmitWithCaptcha(enabled: boolean, token: string | null, widgetFailed: boolean): boolean {
  if (!enabled) return true;
  return token !== null || widgetFailed;
}

/** Supabase Auth'un CAPTCHA reddi (`captcha_failed` / "captcha verification process failed"). */
export function isCaptchaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { message, code } = error as { message?: unknown; code?: unknown };
  return (
    (typeof code === "string" && /captcha/i.test(code)) ||
    (typeof message === "string" && /captcha/i.test(message))
  );
}
