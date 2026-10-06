import type { InventoryCatalog, InventoryCategory, InventoryLocation, InventoryMaterial } from "@/types/inventory";
import { INVENTORY_UNITS, UNCATEGORIZED_LABEL, getCategoryName, stockAt, totalStock } from "@/lib/constants/inventory";
import { fitLogo, loadLogoImage, type ReportBrand } from "@/lib/report-brand";
import { embedRoboto } from "@/lib/pdf-fonts";

type InventoryExportOptions = {
  brand: ReportBrand;
  catalogs: InventoryCatalog[];
  materials: InventoryMaterial[];
  categories: InventoryCategory[];
  locations: InventoryLocation[];
  /** Çıktıya alınacak kategoriler; null = kategorisiz */
  selectedCategoryIds: (string | null)[];
  /** Kullanıcının yazdığı üst başlık; boşsa otomatik başlık */
  title?: string;
  /** false ise firma logosu konmaz */
  includeLogo?: boolean;
};

type Column = { header: string; width: number; numeric?: boolean };

/** Kategori adı listesi boşsa tüm malzemeler. */
export function getInventoryExportTitle(brandName: string, categoryNames: string[]) {
  const scope = categoryNames.length ? `${categoryNames.join(" / ")} ` : "";
  return `${brandName} ${scope}MALZEME LİSTESİ`.toLocaleUpperCase("tr-TR");
}

function buildColumns(locations: InventoryLocation[]): Column[] {
  return [
    { header: "Sıra", width: 7, numeric: true },
    { header: "Kategori", width: 20 },
    { header: "Malzeme Adı", width: 30 },
    { header: "Tür / Ebat", width: 18 },
    { header: "Malzeme ID", width: 16 },
    { header: "Birim", width: 9 },
    ...locations.map((location) => ({ header: location.name, width: 14, numeric: true })),
    ...(locations.length > 1 ? [{ header: "Toplam", width: 12, numeric: true }] : []),
  ];
}

function buildRows({ catalogs, materials, categories, locations, selectedCategoryIds }: InventoryExportOptions) {
  const unitLabel = (unit: InventoryCatalog["unit"]) => INVENTORY_UNITS.find((item) => item.value === unit)?.label ?? unit;
  const order = new Map(categories.map((item, index) => [item.id, index]));
  const rows: (string | number)[][] = [];
  const selected = catalogs
    .filter((catalog) => selectedCategoryIds.includes(catalog.category_id ?? null))
    .sort((a, b) =>
      ((order.get(a.category_id ?? "") ?? 999) - (order.get(b.category_id ?? "") ?? 999)) ||
      a.material_name.localeCompare(b.material_name, "tr"));
  for (const catalog of selected) {
    const base = [
      getCategoryName(categories, catalog.category_id),
      catalog.material_name,
      [catalog.material_type, catalog.size].filter(Boolean).join(" · "),
    ];
    // Stoğu tamamen tükenmiş ID'ler listelenmez.
    const lots = materials.filter((item) => item.catalog_id === catalog.id && totalStock(item) > 0);
    if (!lots.length) {
      rows.push([rows.length + 1, ...base, "", unitLabel(catalog.unit), ...locations.map(() => 0), ...(locations.length > 1 ? [0] : [])]);
      continue;
    }
    for (const lot of lots) {
      rows.push([
        rows.length + 1, ...base, lot.material_code ?? "", unitLabel(lot.unit),
        ...locations.map((location) => stockAt(lot, location)),
        ...(locations.length > 1 ? [totalStock(lot)] : []),
      ]);
    }
  }
  return rows;
}

function exportTitle(options: InventoryExportOptions) {
  if (options.title?.trim()) return options.title.trim();
  const all = options.selectedCategoryIds.length === new Set([...options.categories.map((item) => item.id), ...options.catalogs.map((item) => item.category_id ?? null)]).size;
  const names = all ? [] : options.selectedCategoryIds.map((id) => (id ? getCategoryName(options.categories, id) : UNCATEGORIZED_LABEL));
  return getInventoryExportTitle(options.brand.name, names);
}

const formatToday = () => new Intl.DateTimeFormat("tr-TR").format(new Date());
const formatNumber = (value: string | number) =>
  typeof value === "number" ? value.toLocaleString("tr-TR", { maximumFractionDigits: 3 }) : value;

export async function downloadInventoryStockExcel(options: InventoryExportOptions & { fileName: string }) {
  const [{ Workbook }, logo] = await Promise.all([import("exceljs"), options.includeLogo === false ? null : loadLogoImage(options.brand.logoUrl)]);
  const columns = buildColumns(options.locations);
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Malzeme Stok");
  worksheet.columns = columns.map(({ width }) => ({ width }));

  const titleRow = worksheet.addRow([exportTitle(options)]);
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, columns.length);
  titleRow.height = logo ? 48 : 32;
  if (logo) {
    const imageId = workbook.addImage({ base64: logo.dataUrl, extension: "png" });
    worksheet.addImage(imageId, { tl: { col: 0.1, row: titleRow.number - 1 + 0.1 }, ext: fitLogo(logo, 110, 56) });
  }
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  const dateRow = worksheet.addRow([`Tarih: ${formatToday()}`]);
  worksheet.mergeCells(dateRow.number, 1, dateRow.number, columns.length);
  dateRow.getCell(1).alignment = { vertical: "middle", horizontal: "right" };
  dateRow.getCell(1).font = { italic: true, size: 10 };

  const headerRow = worksheet.addRow(columns.map((column) => column.header));
  headerRow.font = { bold: true };
  headerRow.height = 28;
  buildRows(options).forEach((row) => worksheet.addRow(row));

  columns.forEach((column, index) => {
    if (column.numeric && index > 0) worksheet.getColumn(index + 1).numFmt = "#,##0.###";
  });
  worksheet.getColumn(5).numFmt = "@";
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < headerRow.number) return;
    if (rowNumber > headerRow.number) row.height = 20;
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      const numeric = columns[columnNumber - 1]?.numeric;
      cell.alignment = {
        vertical: "middle",
        horizontal: rowNumber === headerRow.number ? "center" : numeric ? "right" : "left",
        wrapText: rowNumber === headerRow.number,
      };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });
  worksheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  worksheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: columns.length },
  };
  worksheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printTitlesRow: `${headerRow.number}:${headerRow.number}`,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([new Uint8Array(buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    options.fileName
  );
}

export async function downloadInventoryStockPdf(options: InventoryExportOptions & { fileName: string }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const columns = buildColumns(options.locations);
  const pdf = new jsPDF({ orientation: columns.length > 8 ? "landscape" : "portrait", unit: "mm", format: "a4" });
  await embedRoboto(pdf);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const logo = options.includeLogo === false ? null : await loadLogoImage(options.brand.logoUrl);
  let titleY = 16;
  if (logo) {
    const size = fitLogo(logo, 40, 16);
    pdf.addImage(logo.dataUrl, "PNG", (pageWidth - size.width) / 2, 8, size.width, size.height);
    titleY = 8 + size.height + 7;
  }
  const titleLines: string[] = pdf.setFont("Roboto", "bold").setFontSize(13).splitTextToSize(exportTitle(options), pageWidth - 28);
  pdf.text(titleLines, pageWidth / 2, titleY, { align: "center" });
  const dateY = titleY + titleLines.length * 6;
  pdf.setFont("Roboto", "normal").setFontSize(9).text(`Tarih: ${formatToday()}`, pageWidth - 14, dateY, { align: "right" });

  const numericColumns = Object.fromEntries(
    columns.flatMap((column, index) => (column.numeric ? [[index, { halign: "right" as const }]] : []))
  );
  autoTable(pdf, {
    head: [columns.map((column) => column.header)],
    body: buildRows(options).map((row) => row.map(formatNumber)),
    startY: dateY + 4,
    styles: { font: "Roboto", fontSize: 8, cellPadding: 1.6, valign: "middle" },
    headStyles: { font: "Roboto", fontStyle: "bold", fillColor: [30, 64, 175], halign: "center" },
    columnStyles: { ...numericColumns, 0: { halign: "right", cellWidth: 10 } },
    didDrawPage: () => {
      const page = pdf.getCurrentPageInfo().pageNumber;
      pdf.setFont("Roboto", "normal").setFontSize(8).text(`Sayfa ${page}`, pageWidth / 2, pdf.internal.pageSize.getHeight() - 8, { align: "center" });
    },
  });
  pdf.save(options.fileName);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
