/**
 * Süper adminin ELLE gönderdiği karşılama e-postası için yer tutucu doldurma.
 * Sistem e-posta göndermez. Düz metindir: HTML yorumlanmaz; bilinmeyen yer tutucu olduğu gibi kalır
 * (veritabanı bilinmeyen yer tutuculu şablonu zaten kaydetmez). Bilerek içe aktarma yok.
 */

export const TEMPLATE_PLACEHOLDERS = ["ad", "firma", "deneme_bitis"] as const;
export type TemplateVars = Record<(typeof TEMPLATE_PLACEHOLDERS)[number], string>;

export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*([A-Za-z0-9_]*)\s*\}\}/g, (whole, key: string) =>
    (TEMPLATE_PLACEHOLDERS as readonly string[]).includes(key) ? vars[key as keyof TemplateVars] : whole
  );
}

/** Metindeki bilinmeyen yer tutucular (kaydetmeden önce uyarı için). */
export function unknownPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/\{\{\s*([A-Za-z0-9_]*)\s*\}\}/g)) {
    if (!(TEMPLATE_PLACEHOLDERS as readonly string[]).includes(match[1])) found.add(match[1]);
  }
  return [...found];
}

/** mailto bağlantıları e-posta istemcilerinde uzunluk sınırlıdır; kopyalama düğmeleri asıl yoldur. */
export function mailtoHref(to: string | null, subject: string, body: string): string | null {
  if (!to) return null;
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** "Mustafa Öner" → "Mustafa"; boşsa e-postanın @ öncesi. */
export function greetingName(fullName: string | null | undefined, email: string | null | undefined): string {
  const name = (fullName ?? "").trim();
  if (name) return name.split(/\s+/)[0];
  return (email ?? "").split("@")[0] ?? "";
}
