import { FILE_NAME_PREFIX } from "@/lib/constants/brand";

export type SheetColumn = { header: string; key: string; width?: number; money?: boolean };

/** Başlık satırlı tek sayfalık Excel dosyası indirir (taşeron ekstresi, maaş dökümü gibi). */
export async function downloadSimpleSheet({
  fileName,
  sheetName,
  title,
  columns,
  rows,
  footer,
}: {
  fileName: string;
  sheetName: string;
  /** Tablonun üstündeki başlık satırları (firma adı, dönem...). */
  title: string[];
  columns: SheetColumn[];
  rows: Record<string, string | number | null>[];
  /** Tablonun altındaki özet satırları: [etiket, değer]. */
  footer?: [string, string | number][];
}) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31));

  title.forEach((line, index) => {
    const row = sheet.addRow([line]);
    row.font = { bold: index === 0, size: index === 0 ? 14 : 11 };
  });
  sheet.addRow([]);

  const header = sheet.addRow(columns.map((column) => column.header));
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });
  for (const row of rows) sheet.addRow(columns.map((column) => row[column.key] ?? ""));
  columns.forEach((column, index) => {
    const col = sheet.getColumn(index + 1);
    col.width = column.width ?? 16;
    if (column.money) col.numFmt = "#,##0.00";
  });

  if (footer?.length) {
    sheet.addRow([]);
    for (const [label, value] of footer) {
      const row = sheet.addRow([label, value]);
      row.font = { bold: true };
      if (typeof value === "number") row.getCell(2).numFmt = "#,##0.00";
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${FILE_NAME_PREFIX}-${fileName}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
}
