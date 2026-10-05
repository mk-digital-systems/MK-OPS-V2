import type { Vehicle } from "@/types/vehicle";
import type { InventoryCustodyBalance } from "@/types/inventory";

export async function downloadVehicleEquipmentWord(vehicle: Vehicle, balances: InventoryCustodyBalance[]) {
  const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");
  const rows = balances.map((balance, index) => new TableRow({ children: [
    new TableCell({ children: [new Paragraph(String(index + 1))] }),
    new TableCell({ children: [new Paragraph(balance.material?.material_name || "—")] }),
    new TableCell({ children: [new Paragraph(`${Number(balance.quantity).toLocaleString("tr-TR")} adet`)] }),
  ] }));
  const header = new TableRow({ tableHeader: true, children: ["Sıra", "Malzeme", "Miktar"].map((label) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: label, bold: true })] })] })) });
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: "AZG İLETİŞİM ARAÇ EKİPMAN LİSTESİ", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: "Araç: ", bold: true }), new TextRun(vehicle.plate)] }),
    new Paragraph({ children: [new TextRun({ text: "Marka / Model: ", bold: true }), new TextRun(`${vehicle.brand} ${vehicle.model}`)] }),
    new Paragraph({ text: `Rapor Tarihi: ${new Date().toLocaleDateString("tr-TR")}`, spacing: { after: 300 } }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] }),
    new Paragraph({ text: `Toplam ${balances.length} malzeme kalemi`, spacing: { before: 300 } }),
  ] }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url;
  link.download = `Arac-Ekipman-Listesi-${vehicle.plate.replace(/\s+/g, "-")}.docx`;
  link.click(); URL.revokeObjectURL(url);
}
