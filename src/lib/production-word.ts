import type { ProductionEntry } from "@/types/production";

export async function downloadProductionWord(entries: ProductionEntry[], from: string, to: string, leaderName?: string) {
  const { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import("docx");
  const rows = entries.flatMap((entry) => entry.jobs.flatMap((job) => job.items.map((item) => new TableRow({ children: [
    entry.work_date, entry.team_leader_name_snapshot, job.project_name_snapshot, job.project_code_snapshot || "—", item.item_name_snapshot,
    Number(item.quantity).toLocaleString("tr-TR"), item.unit_snapshot,
  ].map((text) => new TableCell({ children: [new Paragraph(String(text))] })) }))));
  const header = new TableRow({ tableHeader: true, children: ["Tarih","Ekip Başı","Proje Adı","Proje ID","İmalat Kalemi","Miktar","Birim"].map((text) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })] })) });
  const totals = [...entries.flatMap((entry) => entry.jobs.flatMap((job) => job.items)).reduce((map, item) => {
    const key = `${item.item_name_snapshot}|||${item.unit_snapshot}`;
    map.set(key, (map.get(key) || 0) + Number(item.quantity));
    return map;
  }, new Map<string, number>()).entries()];
  const doc = new Document({ sections: [{ children: [
    new Paragraph({ text: "AZG İLETİŞİM MERKEZ", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: "İMALAT DÖKÜMÜ", heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: "Tarih Aralığı: ", bold: true }), new TextRun(`${from} - ${to}`)] }),
    ...(leaderName ? [new Paragraph({ children: [new TextRun({ text: "Ekip Başı: ", bold: true }), new TextRun(leaderName)] })] : []),
    new Paragraph(""), new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [header, ...rows] }),
    new Paragraph({ text: "TOPLAM İŞ KALEMİ MİKTARLARI", heading: HeadingLevel.HEADING_2, spacing: { before: 300 } }),
    ...totals.map(([key, quantity]) => { const [name, unit] = key.split("|||"); return new Paragraph({ children: [new TextRun({ text: `${name}: `, bold: true }), new TextRun(`${quantity.toLocaleString("tr-TR")} ${unit}`)] }); }),
  ] }] });
  const blob = await Packer.toBlob(doc); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href=url; link.download=`Imalat-Dokumu-${from}-${to}.docx`; link.click(); URL.revokeObjectURL(url);
}
