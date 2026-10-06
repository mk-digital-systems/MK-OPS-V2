import type { InventoryCatalog, InventoryMaterial, InventoryStockCategory } from "@/types/inventory";
import { INVENTORY_STOCK_CATEGORIES, INVENTORY_UNITS } from "@/lib/constants/inventory";
import { fitLogo, loadLogoImage, type ReportBrand } from "@/lib/report-brand";
import { embedRoboto } from "@/lib/pdf-fonts";

type InventoryExportOptions = {
  brand: ReportBrand;
  catalogs: InventoryCatalog[];
  materials: InventoryMaterial[];
  categories: InventoryStockCategory[];
};

type ExportRow = {
  sequence: number;
  category: string;
  materialName: string;
  materialType: string;
  materialCode: string;
  unit: string;
  center: number;
};

const COLUMNS: { header: string; key: keyof ExportRow; width: number }[] = [
  { header: "Sıra", key: "sequence", width: 7 },
  { header: "Kategori", key: "category", width: 22 },
  { header: "Malzeme Adı", key: "materialName", width: 32 },
  { header: "Tür", key: "materialType", width: 18 },
  { header: "Malzeme ID", key: "materialCode", width: 18 },
  { header: "Birim", key: "unit", width: 10 },
  { header: "Merkez Depo Stok", key: "center", width: 18 },
];

export function getInventoryExportTitle(brandName: string, categories: InventoryStockCategory[]) {
  const names = INVENTORY_STOCK_CATEGORIES
    .filter((item) => categories.includes(item.value))
    .map((item) => item.label.replace(/ Malzeme$/, ""));
  return `${brandName} ${names.join(" / ")} MALZEME LİSTESİ`.toLocaleUpperCase("tr-TR");
}

function buildRows({ catalogs, materials, categories }: InventoryExportOptions) {
  const unitLabel = (unit: InventoryCatalog["unit"]) => INVENTORY_UNITS.find((item) => item.value === unit)?.label ?? unit;
  const rows: ExportRow[] = [];
  for (const category of INVENTORY_STOCK_CATEGORIES.filter((item) => categories.includes(item.value))) {
    const categoryCatalogs = catalogs
      .filter((catalog) => catalog.stock_category === category.value)
      .sort((a, b) => a.material_name.localeCompare(b.material_name, "tr"));
    for (const catalog of categoryCatalogs) {
      const base = { category: category.label, materialName: catalog.material_name, materialType: catalog.material_type ?? "" };
      // Yalnızca Merkez Depo stoğu raporlanır; Biga'ya tamamen sevk edilmiş ID'ler listelenmez.
      const lots = materials.filter((item) => item.catalog_id === catalog.id && Number(item.stock_quantity) > 0);
      if (!lots.length) {
        rows.push({ sequence: rows.length + 1, ...base, materialCode: "", unit: unitLabel(catalog.unit), center: 0 });
        continue;
      }
      for (const lot of lots) {
        rows.push({ sequence: rows.length + 1, ...base, materialCode: lot.material_code ?? "", unit: unitLabel(lot.unit), center: Math.round(Number(lot.stock_quantity)) });
      }
    }
  }
  return rows;
}

const formatToday = () => new Intl.DateTimeFormat("tr-TR").format(new Date());

export async function downloadInventoryStockExcel(options: InventoryExportOptions & { fileName: string }) {
  const [{ Workbook }, logo] = await Promise.all([import("exceljs"), loadLogoImage(options.brand.logoUrl)]);
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Malzeme Stok");
  worksheet.columns = COLUMNS.map(({ key, width }) => ({ key, width }));

  const titleRow = worksheet.addRow([getInventoryExportTitle(options.brand.name, options.categories)]);
  worksheet.mergeCells(titleRow.number, 1, titleRow.number, COLUMNS.length);
  titleRow.height = logo ? 48 : 32;
  if (logo) {
    const imageId = workbook.addImage({ base64: logo.dataUrl, extension: "png" });
    worksheet.addImage(imageId, { tl: { col: 0.1, row: titleRow.number - 1 + 0.1 }, ext: fitLogo(logo, 110, 56) });
  }
  titleRow.getCell(1).font = { bold: true, size: 14 };
  titleRow.getCell(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };

  const dateRow = worksheet.addRow([`Tarih: ${formatToday()}`]);
  worksheet.mergeCells(dateRow.number, 1, dateRow.number, COLUMNS.length);
  dateRow.getCell(1).alignment = { vertical: "middle", horizontal: "right" };
  dateRow.getCell(1).font = { italic: true, size: 10 };

  const headerRow = worksheet.addRow(COLUMNS.map((column) => column.header));
  headerRow.font = { bold: true };
  headerRow.height = 28;
  buildRows(options).forEach((row) => worksheet.addRow(row));

  worksheet.getColumn("materialCode").numFmt = "@";
  worksheet.getColumn("center").numFmt = "0";
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < headerRow.number) return;
    if (rowNumber > headerRow.number) row.height = 20;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: "middle", horizontal: rowNumber === headerRow.number ? "center" : "left" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
    if (rowNumber > headerRow.number) {
      for (const key of ["sequence", "center"]) row.getCell(key).alignment = { vertical: "middle", horizontal: "right" };
    }
  });
  worksheet.views = [{ state: "frozen", ySplit: headerRow.number }];
  worksheet.autoFilter = {
    from: { row: headerRow.number, column: 1 },
    to: { row: headerRow.number, column: COLUMNS.length },
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
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await embedRoboto(pdf);

  const pageWidth = pdf.internal.pageSize.getWidth();
  const logo = await loadLogoImage(options.brand.logoUrl);
  let titleY = 16;
  if (logo) {
    const size = fitLogo(logo, 40, 16);
    pdf.addImage(logo.dataUrl, "PNG", (pageWidth - size.width) / 2, 8, size.width, size.height);
    titleY = 8 + size.height + 7;
  }
  const titleLines: string[] = pdf.setFont("Roboto", "bold").setFontSize(13).splitTextToSize(getInventoryExportTitle(options.brand.name, options.categories), pageWidth - 28);
  pdf.text(titleLines, pageWidth / 2, titleY, { align: "center" });
  const dateY = titleY + titleLines.length * 6;
  pdf.setFont("Roboto", "normal").setFontSize(9).text(`Tarih: ${formatToday()}`, pageWidth - 14, dateY, { align: "right" });

  autoTable(pdf, {
    head: [COLUMNS.map((column) => column.header)],
    body: buildRows(options).map((row) => COLUMNS.map((column) => row[column.key])),
    startY: dateY + 4,
    styles: { font: "Roboto", fontSize: 8.5, cellPadding: 1.8, valign: "middle" },
    headStyles: { font: "Roboto", fontStyle: "bold", fillColor: [30, 64, 175], halign: "center" },
    columnStyles: { 0: { halign: "right", cellWidth: 11 }, 6: { halign: "right", cellWidth: 22 } },
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
