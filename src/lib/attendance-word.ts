import type { AttendanceRecord } from "@/types/attendance";
import { getAttendanceMeta, MONTH_NAMES } from "@/lib/constants/attendance";
import {
  countAttendanceRecords,
  countPayableDays,
  maskTcIdentityNumber,
  toFileSlug,
} from "@/lib/attendance-excel";

type AttendanceWordPerson = {
  fullName: string;
  tcIdentityNumber: string | null;
  records: AttendanceRecord[];
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatReportDate() {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  }).format(new Date());
}

function getPeriod(year: number, month: number) {
  const lastDay = new Date(year, month, 0).getDate();
  return `01.${pad(month)}.${year} - ${pad(lastDay)}.${pad(month)}.${year}`;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function toFileNamePart(value: string) {
  return toFileSlug(value)
    .split("-")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("-");
}

export async function downloadMonthlyAttendanceWord(options: {
  personnel: AttendanceWordPerson[];
  year: number;
  month: number;
  notes?: string;
}) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    PageOrientation,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableLayoutType,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = await import("docx");

  const borders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
    left: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
    right: { style: BorderStyle.SINGLE, size: 4, color: "808080" },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: "B7B7B7" },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: "B7B7B7" },
  };
  const headers = [
    "Sıra No",
    "Ad Soyad",
    "TC Kimlik No",
    "Toplam Hak Edilen Gün",
  ];
  const cell = (
    text: string | number,
    align: (typeof AlignmentType)[keyof typeof AlignmentType] =
      AlignmentType.CENTER,
    bold = false
  ) =>
    new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 90, bottom: 90, left: 80, right: 80 },
      children: [
        new Paragraph({
          alignment: align,
          children: [new TextRun({ text: String(text), bold, size: 16 })],
        }),
      ],
    });

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (header) =>
        new TableCell({
          shading: { type: ShadingType.CLEAR, fill: "D9E2F3" },
          verticalAlign: VerticalAlign.CENTER,
          margins: { top: 110, bottom: 110, left: 70, right: 70 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: header, bold: true, size: 16 })],
            }),
          ],
        })
    ),
  });
  const rows = options.personnel.map((person, index) =>
    new TableRow({
      cantSplit: true,
      children: [
        cell(index + 1),
        cell(person.fullName, AlignmentType.LEFT),
        cell(maskTcIdentityNumber(person.tcIdentityNumber)),
        cell(countPayableDays(person.records), AlignmentType.CENTER, true),
      ],
    })
  );
  const noteItems = options.notes
    ?.split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean) ?? [];
  const noteTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders,
    rows: [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            margins: { top: 110, bottom: 110, left: 120, right: 120 },
            children: [
              new Paragraph({
                spacing: { after: noteItems.length ? 80 : 0 },
                children: [new TextRun({ text: "NOT", bold: true, size: 18 })],
              }),
              ...(noteItems.length
                ? noteItems.map(
                    (item) =>
                      new Paragraph({
                        spacing: { after: 40 },
                        children: [new TextRun({ text: item, size: 17 })],
                      })
                  )
                : [new Paragraph({ children: [new TextRun({ text: " ", size: 17 })] })]),
            ],
          }),
        ],
      }),
    ],
  });
  const monthName = MONTH_NAMES[options.month - 1].toLocaleUpperCase("tr-TR");
  const document = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE },
            margin: { top: 850, right: 650, bottom: 850, left: 650 },
          },
        },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: "AZG İLETİŞİM MERKEZ", bold: true, size: 30 })],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 260 },
            children: [
              new TextRun({
                text: `${monthName} ${options.year} PERSONEL PUANTAJ RAPORU`,
                bold: true,
                size: 24,
              }),
            ],
          }),
          new Paragraph({ children: [new TextRun({ text: `Dönem: ${getPeriod(options.year, options.month)}`, bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: `Rapor Tarihi: ${formatReportDate()}` })] }),
          new Paragraph({ spacing: { after: 220 }, children: [new TextRun({ text: `Toplam Personel: ${options.personnel.length}` })] }),
          noteTable,
          new Paragraph({ spacing: { after: 100 } }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            layout: TableLayoutType.FIXED,
            borders,
            rows: [headerRow, ...rows],
          }),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  downloadBlob(
    blob,
    `AZG-Iletisim-Merkez-Puantaj-${options.year}-${pad(options.month)}.docx`
  );
}

export async function downloadPersonnelAttendanceWord(options: {
  person: AttendanceWordPerson;
  year: number;
  month: number;
}) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Packer,
    Paragraph,
    ShadingType,
    Table,
    TableCell,
    TableRow,
    TextRun,
    VerticalAlign,
    WidthType,
  } = await import("docx");
  const border = { style: BorderStyle.SINGLE, size: 4, color: "808080" };
  const tableCell = (
    text: string,
    bold = false,
    align: (typeof AlignmentType)[keyof typeof AlignmentType] = AlignmentType.LEFT
  ) =>
    new TableCell({
      verticalAlign: VerticalAlign.CENTER,
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
      children: [new Paragraph({ alignment: align, children: [new TextRun({ text, bold, size: 19 })] })],
    });
  const totals = countAttendanceRecords(options.person.records);
  const summaryRows: [string, number][] = [
    ["Çalıştığı Gün", totals.worked],
    ["İzinli Gün", totals.leave],
    ["Raporlu Gün", totals.medical_report],
    ["Hafta Tatili", totals.weekly_rest],
    ["Mazeretsiz Gelmedi", totals.unexcused_absence],
    ["Toplam Hak Edilen Gün", countPayableDays(options.person.records)],
  ];
  const records = [...options.person.records].sort((a, b) => a.date.localeCompare(b.date));
  const dailyHeader = new TableRow({
    tableHeader: true,
    children: ["Tarih", "Gün", "Puantaj Durumu"].map((value) =>
      new TableCell({
        shading: { type: ShadingType.CLEAR, fill: "D9E2F3" },
        margins: { top: 110, bottom: 110, left: 120, right: 120 },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: value, bold: true })] })],
      })
    ),
  });
  const dailyRows = records.map((record) => {
    const [year, month, day] = record.date.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    const dayName = new Intl.DateTimeFormat("tr-TR", {
      weekday: "long",
      timeZone: "UTC",
    }).format(date);
    return new TableRow({
      cantSplit: true,
      children: [
        tableCell(`${pad(day)}.${pad(month)}.${year}`, false, AlignmentType.CENTER),
        tableCell(dayName, false, AlignmentType.CENTER),
        tableCell(getAttendanceMeta(record.status).label, false, AlignmentType.CENTER),
      ],
    });
  });
  const document = new Document({
    styles: { default: { document: { run: { font: "Arial", size: 20 } } } },
    sections: [
      {
        properties: { page: { margin: { top: 1000, right: 1000, bottom: 1000, left: 1000 } } },
        children: [
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [new TextRun({ text: "AZG İLETİŞİM MERKEZ", bold: true, size: 30 })] }),
          new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 280 }, children: [new TextRun({ text: "PERSONEL PUANTAJ RAPORU", bold: true, size: 24 })] }),
          new Paragraph({ children: [new TextRun({ text: `Ad Soyad: ${options.person.fullName}`, bold: true })] }),
          new Paragraph({ children: [new TextRun({ text: `TC Kimlik No: ${maskTcIdentityNumber(options.person.tcIdentityNumber)}` })] }),
          new Paragraph({ children: [new TextRun({ text: `Dönem: ${MONTH_NAMES[options.month - 1]} ${options.year}` })] }),
          new Paragraph({ spacing: { after: 220 }, children: [new TextRun({ text: `Rapor Tarihi: ${formatReportDate()}` })] }),
          new Table({
            width: { size: 65, type: WidthType.PERCENTAGE },
            borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
            rows: summaryRows.map(([label, value]) => new TableRow({ children: [tableCell(label, true), tableCell(String(value), true, AlignmentType.CENTER)] })),
          }),
          new Paragraph({ spacing: { before: 300, after: 120 }, children: [new TextRun({ text: "Günlük Puantaj Dökümü", bold: true, size: 22 })] }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
            rows: [dailyHeader, ...dailyRows],
          }),
        ],
      },
    ],
  });
  const blob = await Packer.toBlob(document);
  downloadBlob(
    blob,
    `AZG-Iletisim-Merkez-${toFileNamePart(options.person.fullName)}-Puantaj-${options.year}-${pad(options.month)}.docx`
  );
}
