export const APP_NAME = "MK OPS";
export const APP_TAGLINE = "Şantiye Operasyon Yönetimi";
export const APP_LOGO_SRC = "/images/logo-mk-ops.png";
export const FILE_NAME_PREFIX = "MK-OPS";
export const SUPPORT_EMAIL = "iletisim@mk-digitalsystems.com";
export const SUPPORT_WHATSAPP = "905456597551";
export const COMPANY_LEGAL_NAME = "MK Digital Systems";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mk-ops-v2.vercel.app";

export function whatsappUrl(text = "MK OPS hakkında bilgi almak istiyorum.") {
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}
