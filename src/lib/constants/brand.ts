export const APP_NAME = "MK OPS";
export const APP_TAGLINE = "Şantiye Operasyon Yönetimi";
export const APP_LOGO_SRC = "/images/logo-mk-ops.png";
export const FILE_NAME_PREFIX = "MK-OPS";
export const SUPPORT_EMAIL = "iletisim@mk-digitalsystems.com";
export const COMPANY_LEGAL_NAME = "MK Digital Systems";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mk-ops-v2.vercel.app";

export function contactMailto(subject = "MK OPS hakkında bilgi") {
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
