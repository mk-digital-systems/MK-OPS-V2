import type { jsPDF } from "jspdf";

const fontCache = new Map<string, Promise<string>>();

async function loadFontBase64(path: string) {
  const response = await fetch(path);
  if (!response.ok) throw new Error("PDF fontu yüklenemedi");
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function cachedFont(path: string) {
  let pending = fontCache.get(path);
  if (!pending) {
    pending = loadFontBase64(path).catch((error) => {
      fontCache.delete(path);
      throw error;
    });
    fontCache.set(path, pending);
  }
  return pending;
}

/**
 * Varsayılan PDF fontları Türkçe karakterleri (ş, ğ, İ, ı) desteklemediği için Roboto gömülür.
 * Sonrasında `pdf.setFont("Roboto", "normal" | "bold")` kullanılır.
 */
export async function embedRoboto(pdf: jsPDF) {
  const [regular, bold] = await Promise.all([
    cachedFont("/fonts/Roboto-Regular.ttf"),
    cachedFont("/fonts/Roboto-Bold.ttf"),
  ]);
  pdf.addFileToVFS("Roboto-Regular.ttf", regular);
  pdf.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  pdf.addFileToVFS("Roboto-Bold.ttf", bold);
  pdf.addFont("Roboto-Bold.ttf", "Roboto", "bold");
}
