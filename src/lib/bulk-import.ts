/** Excel'den yapıştırılan metni satır ve hücrelere ayırır (sekme ya da noktalı virgül). Boş satırlar atlanır. */
export function parsePastedRows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(line.includes("\t") ? "\t" : ";").map((cell) => cell.trim()))
    .filter((cells) => cells.some(Boolean));
}

/** İlk satır başlıksa (ör. "Ad Soyad", "Plaka") atlanır. */
export function dropHeaderRow(rows: string[][], headerPattern: RegExp): string[][] {
  return rows.length && headerPattern.test(rows[0].join(" ")) ? rows.slice(1) : rows;
}

/**
 * Tarih hücresi: "01.10.2026", "1/10/2026", "2026-10-01" kabul edilir. Boşsa null; okunamazsa undefined.
 */
export function parseDateCell(value: string): string | null | undefined {
  const text = value.trim();
  if (!text) return null;
  let year: number, month: number, day: number;
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const tr = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (iso) [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (tr) [day, month, year] = [Number(tr[1]), Number(tr[2]), Number(tr[3])];
  else return undefined;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Türkçe sayı metnini makinenin okuyacağı biçime çevirir: "25.000,50" → "25000.50", "35.000" → "35000",
 * "1.250.000" → "1250000", "12,5" → "12.5", "12.50" → "12.50". Virgül varsa ondalıktır ve noktalar binliktir;
 * virgül yoksa yalnızca üçlü gruplanmış noktalar binlik sayılır.
 */
export function normalizeNumberText(value: string): string {
  const text = value.trim().replace(/\s/g, "").replace(/₺|TL/gi, "");
  if (text.includes(",")) return text.replace(/\./g, "").replace(",", ".");
  if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) return text.replace(/\./g, "");
  return text;
}

/** Tutar / sayı hücresi (bkz. normalizeNumberText). Boşsa null; okunamazsa undefined. */
export function parseNumberCell(value: string): number | null | undefined {
  const text = normalizeNumberText(value);
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}
