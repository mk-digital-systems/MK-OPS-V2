import type { Vehicle } from "@/types/vehicle";
import type { InventoryCustodyBalance } from "@/types/inventory";
import { brandFilePrefix, docxBrandHeader, type ReportBrand } from "@/lib/report-brand";

export async function downloadVehicleEquipmentWord(brand: ReportBrand, vehicle: Vehicle, balances: InventoryCustodyBalance[]) {
  const docx = await import("docx");
  const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = docx;
  const brandHeader = await docxBrandHeader(docx, brand);
  const rows = balances.map((balance, index) => new TableRow({ children: [
    new TableCell({ children: [new Paragraph(String(index + 1))] }),
    new TableCell({ children: [new Paragraph(balance.material?.material_name || "—")] }),
    new TableCell({ children: [new Paragraph(`${Number(balance.quantity).toLocaleString("tr-TR")} adet`)] }),
  ] }));
  const header = new TableRow({ tableHeader: true, children: ["Sıra", "Malzeme", "Miktar"].map((label) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] })) });
  const doc = new Document({ sections: [{ children: [
    ...brandHeader,
    new Paragraph({ text: "ARAÇ EKİPMAN LİSTESİ", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: "Araç: ", bold: true }), new TextRun(vehicle.plate)] }),
    new Paragraph({ children: [new TextRun({ text: "Marka / Model: ", bold: true }), new TextRun(`${vehicle.brand} ${vehicle.model}`)] }),
    new Paragraph({ text: `Rapor Tarihi: ${new Date().toLocaleDateString("tr-TR")}`, spacing: { after: 300 } }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] }),
    new Paragraph({ text: `Toplam ${balances.length} malzeme kalemi`, spacing: { before: 300 } }),
  ] }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url;
  link.download = `${brandFilePrefix(brand)}-Arac-Ekipman-Listesi-${vehicle.plate.replace(/\s+/g, "-")}.docx`;
  link.click(); URL.revokeObjectURL(url);
}
