import type {
  AttendanceRecord,
  AttendanceStatus,
} from "@/types/attendance";
import { getAttendanceMeta, getMonthDays } from "@/lib/constants/attendance";

type AttendanceExcelPerson = {
  fullName: string;
  tcIdentityNumber: string | null;
  records: AttendanceRecord[];
};

const EXCEL_STATUSES = [
  "worked",
  "leave",
  "medical_report",
  "unexcused_absence",
  "weekly_rest",
] as const satisfies readonly AttendanceStatus[];

const NOTE_CHARACTERS_PER_LINE = 140;
const NOTE_LINES_PER_ROW = 12;

function wrapNoteLines(value: string) {
  const lines: string[] = [];
  for (const paragraph of value.replace(/\r\n/g, "\n").split("\n")) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      if (!line) {
        line = word;
      } else if (`${line} ${word}`.length <= NOTE_CHARACTERS_PER_LINE) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export function maskTcIdentityNumber(value: string | null | undefined) {
  if (!value) return "";
  return `${value.slice(0, 3)}******${value.slice(-2)}`;
}

export function countAttendanceRecords(records: AttendanceRecord[]) {
  const totals = Object.fromEntries(
    EXCEL_STATUSES.map((status) => [status, 0])
  ) as Record<(typeof EXCEL_STATUSES)[number], number>;

  records.forEach((record) => {
    if (EXCEL_STATUSES.includes(record.status as keyof typeof totals)) {
      totals[record.status as keyof typeof totals] += 1;
    }
  });
  return totals;
}

export function countPayableDays(records: AttendanceRecord[]) {
  const totals = countAttendanceRecords(records);
  const sundayWorked = records.filter((record) => {
    if (record.status !== "worked") return false;
    const [year, month, day] = record.date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay() === 0;
  }).length;
  return totals.worked + totals.weekly_rest + sundayWorked;
}

export async function downloadAttendanceSummaryExcel(options: {
  personnel: AttendanceExcelPerson[];
  year: number;
  month: number;
  fileName: string;
  notes?: string;
}) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet("Puantaj Dökümü");
  const days = getMonthDays(options.year, options.month);

  worksheet.columns = [
    { header: "Sıra", key: "sequence", width: 7 },
    { header: "Ad Soyad", key: "fullName", width: 28 },
    { header: "TC Kimlik No", key: "tcIdentityNumber", width: 16 },
    ...days.map((day) => ({
      header: `${String(day.day).padStart(2, "0")} ${day.dayName}`,
      key: `day${day.day}`,
      width: 9,
    })),
    { header: "Toplam Hak Edilen Gün", key: "payableDays", width: 24 },
  ];

  options.personnel.forEach((person, index) => {
    const recordsByDate = new Map(
      person.records.map((record) => [record.date, record.status])
    );
    const row: Record<string, string | number> = {
      sequence: index + 1,
      fullName: person.fullName,
      tcIdentityNumber: person.tcIdentityNumber ?? "",
      payableDays: countPayableDays(person.records),
    };

    days.forEach((day) => {
      const status = recordsByDate.get(day.isoDate);
      row[`day${day.day}`] = status ? getAttendanceMeta(status).symbol : "";
    });
    worksheet.addRow(row);
  });

  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  worksheet.getColumn("tcIdentityNumber").numFmt = "@";
  worksheet.eachRow((row, rowNumber) => {
    row.height = rowNumber === 1 ? 28 : 22;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "middle", horizontal: "center" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
    if (rowNumber > 1) row.getCell("fullName").alignment = { vertical: "middle", horizontal: "left" };
  });
  worksheet.views = [{ state: "frozen", xSplit: 3, ySplit: 1 }];
  worksheet.autoFilter = {
    from: "A1",
    to: `${worksheet.getColumn(worksheet.columnCount).letter}1`,
  };
  worksheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    margins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
  };

  if (options.notes?.trim()) {
    const noteLines = wrapNoteLines(options.notes.trim());
    for (let index = 0; index < noteLines.length; index += NOTE_LINES_PER_ROW) {
      const chunk = noteLines.slice(index, index + NOTE_LINES_PER_ROW);
      const noteRow = worksheet.addRow([]);
      noteRow.getCell(1).value = `${index === 0 ? "Açıklama: " : ""}${chunk.join("\n")}`;
      worksheet.mergeCells(noteRow.number, 1, noteRow.number, worksheet.columnCount);
      noteRow.getCell(1).alignment = { vertical: "top", horizontal: "left", wrapText: true, shrinkToFit: false };
      noteRow.getCell(1).font = { italic: true, size: 10 };
      noteRow.height = Math.max(30, chunk.length * 15 + 10);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = options.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function toFileSlug(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
