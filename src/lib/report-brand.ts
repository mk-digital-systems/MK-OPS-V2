import { APP_NAME, FILE_NAME_PREFIX } from "@/lib/constants/brand";

/** Raporlarda (PDF, Word, Excel, görsel) başlıkta görünen firma adı ve logosu. */
export type ReportBrand = {
  name: string;
  logoUrl: string | null;
};

export const DEFAULT_REPORT_BRAND: ReportBrand = { name: APP_NAME, logoUrl: null };

export const COMPANY_LOGO_BUCKET = "company-logos";
export const COMPANY_LOGO_MAX_BYTES = 2 * 1024 * 1024;
export const COMPANY_LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Herkese açık depodaki logonun adresi (ağ isteği yapmadan üretilir). */
export function companyLogoUrl(path: string | null | undefined): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!path || !base) return null;
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/${COMPANY_LOGO_BUCKET}/${encoded}`;
}

/** Dosya adı öneki: firma adından türetilir ("Yılmaz İnşaat" → "Yilmaz-Insaat"). */
export function brandFilePrefix(brand: ReportBrand): string {
  const slug = brand.name
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[ıİ]/g, "i")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || FILE_NAME_PREFIX;
}

export type LogoImage = {
  /** PNG data URL (jsPDF, <img>) */
  dataUrl: string;
  /** PNG baytları (docx, exceljs) */
  bytes: Uint8Array;
  width: number;
  height: number;
};

const LOGO_MAX_SIDE = 600;
const logoCache = new Map<string, Promise<LogoImage | null>>();

/**
 * Logoyu indirip PNG'ye çevirir (WebP/JPEG fark etmez). Sonuç adres bazında önbelleğe alınır.
 * Logo yüklenemezse null döner; rapor yine firma adıyla üretilir.
 */
export function loadLogoImage(url: string | null | undefined): Promise<LogoImage | null> {
  if (!url || typeof window === "undefined") return Promise.resolve(null);
  let pending = logoCache.get(url);
  if (!pending) {
    pending = rasterizeLogo(url).catch((error) => {
      console.warn("Firma logosu yüklenemedi", error);
      logoCache.delete(url);
      return null;
    });
    logoCache.set(url, pending);
  }
  return pending;
}

async function rasterizeLogo(url: string): Promise<LogoImage | null> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Logo okunamadı"));
      element.src = objectUrl;
    });
    const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/png");
    const binary = atob(dataUrl.split(",")[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return { dataUrl, bytes, width, height };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Logoyu oranını koruyarak verilen kutuya sığdırır. */
export function fitLogo(logo: Pick<LogoImage, "width" | "height">, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / logo.width, maxHeight / logo.height);
  return { width: logo.width * scale, height: logo.height * scale };
}

type DocxModule = typeof import("docx");

/** Word raporlarının başlığı: ortalanmış logo (varsa) ve firma adı. */
export async function docxBrandHeader(docx: DocxModule, brand: ReportBrand) {
  const { AlignmentType, ImageRun, Paragraph, TextRun } = docx;
  const logo = await loadLogoImage(brand.logoUrl);
  const paragraphs = [];
  if (logo) {
    const size = fitLogo(logo, 180, 64);
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new ImageRun({
            type: "png",
            data: logo.bytes,
            transformation: { width: Math.round(size.width), height: Math.round(size.height) },
          }),
        ],
      })
    );
  }
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 },
      children: [new TextRun({ text: brand.name, bold: true, size: 30 })],
    })
  );
  return paragraphs;
}
