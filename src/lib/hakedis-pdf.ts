import type { CurrencyCode } from "@/types/auth";
import type { HakedisReport } from "@/types/hakedis";
import { APP_NAME } from "@/lib/constants/brand";
import { formatQuantity } from "@/lib/constants/project";
import { embedRoboto } from "@/lib/pdf-fonts";
import { brandFilePrefix, fitLogo, loadLogoImage, type ReportBrand } from "@/lib/report-brand";

const MARGIN = 14;
const HEAD_COLOR: [number, number, number] = [30, 64, 175];

/** PDF fontunda para simgesi (₺) garanti olmadığı için kod yazılır: 1.234,50 TL */
function pdfMoney(value: number | null, currency: CurrencyCode) {
  if (value === null || value === undefined) return "—";
  const number = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value));
  return `${number} ${currency === "TRY" ? "TL" : currency}`;
}

function pdfDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

/** Hakediş raporu PDF'i: firma logosu ve adı başlıkta, logo sayfa ortasında filigran. */
export async function downloadHakedisPdf(brand: ReportBrand, report: HakedisReport, currency: CurrencyCode) {
  const [{ default: jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    loadLogoImage(brand.logoUrl),
  ]);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  await embedRoboto(pdf);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const money = (value: number | null) => pdfMoney(value, currency);
  const lastY = () => (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Başlık
  let y = 14;
  if (logo) {
    const size = fitLogo(logo, 45, 18);
    pdf.addImage(logo.dataUrl, "PNG", (pageWidth - size.width) / 2, y - 4, size.width, size.height);
    y += size.height + 4;
  }
  pdf.setFont("Roboto", "bold").setFontSize(15).text(brand.name, pageWidth / 2, y, { align: "center" });
  y += 7;
  pdf.setFontSize(12).text("HAKEDİŞ RAPORU", pageWidth / 2, y, { align: "center" });
  y += 6;
  pdf.setFont("Roboto", "normal").setFontSize(9.5);
  pdf.text(`Dönem: ${pdfDate(report.start)} – ${pdfDate(report.end)}`, MARGIN, y);
  pdf.text(`Rapor tarihi: ${new Intl.DateTimeFormat("tr-TR").format(new Date())}`, pageWidth - MARGIN, y, { align: "right" });
  y += 4;

  // Özet
  autoTable(pdf, {
    startY: y,
    theme: "grid",
    body: [
      ["Toplam hakediş", money(report.total_amount)],
      ["Fiyatlanan iş kaydı", String(report.priced_count)],
      ["Fiyatı girilmemiş iş kaydı", `${report.unpriced_count}${report.unpriced_count > 0 ? " (toplama dahil değil)" : ""}`],
    ],
    styles: { font: "Roboto", fontSize: 9.5, cellPadding: 2 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 }, 1: { halign: "right" } },
    margin: { left: MARGIN, right: MARGIN },
  });

  const section = (title: string) => {
    let top = lastY() + 9;
    if (top > pageHeight - 40) {
      pdf.addPage();
      top = 18;
    }
    pdf.setFont("Roboto", "bold").setFontSize(11).text(title, MARGIN, top);
    return top + 2.5;
  };
  const tableStyles = {
    theme: "striped" as const,
    styles: { font: "Roboto", fontSize: 8.5, cellPadding: 1.8, valign: "middle" as const },
    headStyles: { font: "Roboto", fontStyle: "bold" as const, fillColor: HEAD_COLOR },
    footStyles: { font: "Roboto", fontStyle: "bold" as const, fillColor: [226, 232, 240] as [number, number, number], textColor: 20 },
    margin: { left: MARGIN, right: MARGIN, top: 16, bottom: 16 },
  };

  autoTable(pdf, {
    ...tableStyles,
    startY: section("Proje bazında"),
    head: [["Proje Kodu", "Proje", "Tür", "Tutar"]],
    body: report.by_project.map((row) => [row.project_code, row.project_name, row.type_name, money(row.amount)]),
    foot: [["", "", "Toplam", money(report.total_amount)]],
    columnStyles: { 0: { cellWidth: 26 }, 3: { halign: "right", cellWidth: 34 } },
  });

  autoTable(pdf, {
    ...tableStyles,
    startY: section("Aşama bazında"),
    head: [["Tür", "Aşama", "Miktar", "Tutar"]],
    body: report.by_stage.map((row) => [row.type_name, row.stage_name, formatQuantity(row.quantity, row.unit), money(row.amount)]),
    columnStyles: { 2: { halign: "right", cellWidth: 30 }, 3: { halign: "right", cellWidth: 34 } },
  });

  autoTable(pdf, {
    ...tableStyles,
    startY: section("İş kayıtları"),
    head: [["Tarih", "Proje", "Aşama", "Miktar", "Birim fiyat", "Tutar"]],
    body: report.rows.map((row) => [
      pdfDate(row.log_date),
      row.section_name ? `${row.project_name} · ${row.section_name}` : row.project_name,
      row.stage_name,
      formatQuantity(row.quantity, row.unit),
      row.unit_price === null ? "Fiyat yok" : money(row.unit_price),
      money(row.amount),
    ]),
    styles: { ...tableStyles.styles, fontSize: 7.8 },
    columnStyles: {
      0: { cellWidth: 19 },
      3: { halign: "right", cellWidth: 24 },
      4: { halign: "right", cellWidth: 26 },
      5: { halign: "right", cellWidth: 28 },
    },
  });

  // Filigran ve sayfa altı
  const pageCount = pdf.getNumberOfPages();
  const GState = (pdf as unknown as { GState: new (options: { opacity: number }) => unknown }).GState;
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    if (logo) {
      const size = fitLogo(logo, 120, 120);
      pdf.setGState(new GState({ opacity: 0.06 }));
      pdf.addImage(logo.dataUrl, "PNG", (pageWidth - size.width) / 2, (pageHeight - size.height) / 2, size.width, size.height);
      pdf.setGState(new GState({ opacity: 1 }));
    }
    pdf.setFont("Roboto", "normal").setFontSize(7.5).setTextColor(110);
    pdf.text(`${brand.name} · Hakediş ${pdfDate(report.start)} – ${pdfDate(report.end)}`, MARGIN, pageHeight - 8);
    pdf.text(`Sayfa ${page} / ${pageCount} · ${APP_NAME}`, pageWidth - MARGIN, pageHeight - 8, { align: "right" });
    pdf.setTextColor(0);
  }

  pdf.save(`${brandFilePrefix(brand)}-hakedis-${report.start}_${report.end}.pdf`);
}
