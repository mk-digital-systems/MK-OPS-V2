import type { ProductionEntry } from "@/types/production";

const PAGE_WIDTH_MM = 210;
const PAGE_HEIGHT_MM = 297;
const MARGIN_MM = 14;
const CONTENT_WIDTH_MM = PAGE_WIDTH_MM - MARGIN_MM * 2;
const RENDER_WIDTH_PX = 760;
const FIRST_PAGE_GAP_MM = 6;
const CONTINUATION_TOP_MM = 23;
const TEAM_GAP_MM = 5;

export async function downloadDailyProductionPdf(entries: ProductionEntry[], date: string) {
  const files = await createProductionFiles(entries, formatPdfDate(date), date);
  downloadFile(files.pdf);
}

export async function downloadProductionHistoryPdf(entries: ProductionEntry[], from: string, to: string) {
  const label = from === to ? formatPdfDate(from) : `${formatPdfDate(from)} - ${formatPdfDate(to)}`;
  const suffix = from === to ? from : `${from}-${to}`;
  const files = await createProductionFiles(entries, label, suffix);
  downloadFile(files.pdf);
}

export async function saveAndShareDailyProduction(entries: ProductionEntry[], date: string) {
  const files = await createProductionFiles(entries, formatPdfDate(date), date);
  const shareFiles = [files.pdf];
  if (navigator.share && (!navigator.canShare || navigator.canShare({ files: shareFiles }))) {
    await navigator.share({
      title: `AZG Günlük İmalat ${formatPdfDate(date)}`,
      text: `${formatPdfDate(date)} tarihli günlük imalat raporu`,
      files: shareFiles,
    });
    return true;
  }

  downloadFile(files.pdf);
  window.open(
    `https://wa.me/?text=${encodeURIComponent(`${formatPdfDate(date)} tarihli AZG günlük imalat raporu PDF olarak indirildi.`)}`,
    "_blank",
    "noopener,noreferrer"
  );
  return false;
}

async function createProductionFiles(entries: ProductionEntry[], dateLabel: string, fileSuffix: string) {
  if (!entries.length) throw new Error("Rapor oluşturmak için imalat kaydı bulunamadı");

  const [{ default: jsPDF }, { toPng }] = await Promise.all([
    import("jspdf"),
    import("html-to-image"),
  ]);
  const root = buildPdfDom(entries, dateLabel);
  document.body.appendChild(root);

  try {
    await document.fonts.ready;
    await waitForImages(root);
    const header = root.querySelector<HTMLElement>("[data-pdf-header]")!;
    const teams = [...root.querySelectorAll<HTMLElement>("[data-pdf-team]")];
    const headerImage = await captureElement(header, toPng);
    const teamImages = [];
    for (const team of teams) {
      const image = await captureElement(team, toPng);
      const scale = image.height / team.offsetHeight;
      const teamTop = team.getBoundingClientRect().top;
      const breakpoints = [...team.querySelectorAll<HTMLElement>("[data-pdf-job], [data-pdf-item]")]
        .map((element) => Math.round((element.getBoundingClientRect().bottom - teamTop) * scale))
        .filter((value, index, values) => value > 0 && values.indexOf(value) === index)
        .sort((a, b) => a - b);
      teamImages.push({ ...image, breakpoints, teamName: team.dataset.teamName ?? "" });
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const headerHeight = imageHeightMm(headerImage);
    let y = MARGIN_MM;
    let pageNumber = 1;

    const addHeader = () => {
      pdf.addImage(headerImage.url, "PNG", MARGIN_MM, MARGIN_MM, CONTENT_WIDTH_MM, headerHeight, undefined, "FAST");
      y = MARGIN_MM + headerHeight + FIRST_PAGE_GAP_MM;
    };
    const addPage = () => {
      pdf.addPage();
      pageNumber += 1;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(75, 85, 99);
      pdf.text(`- ${pageNumber} -`, PAGE_WIDTH_MM / 2, MARGIN_MM, { align: "center" });
      y = CONTINUATION_TOP_MM;
    };
    addHeader();

    for (const image of teamImages) {
      const heightMm = imageHeightMm(image);
      const available = PAGE_HEIGHT_MM - MARGIN_MM - y;
      const freshPageAvailable = PAGE_HEIGHT_MM - MARGIN_MM - CONTINUATION_TOP_MM;
      if (heightMm <= freshPageAvailable) {
        if (heightMm > available) addPage();
        pdf.addImage(image.url, "PNG", MARGIN_MM, y, CONTENT_WIDTH_MM, heightMm, undefined, "FAST");
        pdf.setDrawColor(31, 41, 55);
        pdf.setLineWidth(0.25);
        pdf.line(MARGIN_MM, y + heightMm, MARGIN_MM + CONTENT_WIDTH_MM, y + heightMm);
        y += heightMm + TEAM_GAP_MM;
        continue;
      }

      const source = await loadImage(image.url);
      let sourceY = 0;
      let continuation = false;
      while (sourceY < source.height) {
        if (PAGE_HEIGHT_MM - MARGIN_MM - y < 25) addPage();
        if (continuation) {
          pdf.setFont("helvetica", "bold");
          pdf.setFontSize(10);
          pdf.setTextColor(17, 24, 39);
          pdf.text(`EKİP ADI: ${image.teamName} (Devam)`, MARGIN_MM + 3, y + 4);
          y += 7;
        }
        const usableMm = PAGE_HEIGHT_MM - MARGIN_MM - y;
        const maximumEnd = sourceY + Math.floor((usableMm / CONTENT_WIDTH_MM) * source.width);
        const alignedEnd = image.breakpoints.filter((point) => point > sourceY && point <= maximumEnd).at(-1);
        const sliceEnd = Math.min(source.height, alignedEnd ?? maximumEnd);
        const sliceHeightPx = Math.max(1, sliceEnd - sourceY);
        const canvas = document.createElement("canvas");
        canvas.width = source.width;
        canvas.height = sliceHeightPx;
        canvas.getContext("2d")!.drawImage(source, 0, sourceY, source.width, sliceHeightPx, 0, 0, source.width, sliceHeightPx);
        const sliceHeightMm = (sliceHeightPx / source.width) * CONTENT_WIDTH_MM;
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", MARGIN_MM, y, CONTENT_WIDTH_MM, sliceHeightMm, undefined, "FAST");
        pdf.setDrawColor(31, 41, 55);
        pdf.setLineWidth(0.25);
        pdf.rect(MARGIN_MM, y, CONTENT_WIDTH_MM, sliceHeightMm);
        sourceY += sliceHeightPx;
        y += sliceHeightMm;
        if (sourceY < source.height) {
          continuation = true;
          addPage();
        }
      }
      y += TEAM_GAP_MM;
    }

    const pdfFile = new File([pdf.output("blob")], `AZG-MERKEZ-IMALAT-(${fileSuffix}).pdf`, { type: "application/pdf" });
    return { pdf: pdfFile };
  } finally {
    root.remove();
  }
}

function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type CapturedImage = { url: string; width: number; height: number };

async function captureElement(element: HTMLElement, toPng: typeof import("html-to-image").toPng): Promise<CapturedImage> {
  const url = await toPng(element, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
  const image = await loadImage(url);
  return { url, width: image.width, height: image.height };
}

function imageHeightMm(image: CapturedImage) {
  return (image.height / image.width) * CONTENT_WIDTH_MM;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("PDF görseli hazırlanamadı"));
    image.src = url;
  });
}

function waitForImages(root: HTMLElement) {
  return Promise.all([...root.querySelectorAll("img")].map((image) => image.complete
    ? Promise.resolve()
    : new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("AZG logosu yüklenemedi"));
      })));
}

function buildPdfDom(entries: ProductionEntry[], dateLabel: string) {
  const root = document.createElement("div");
  Object.assign(root.style, {
    position: "fixed", left: "-10000px", top: "0", width: `${RENDER_WIDTH_PX}px`,
    background: "#ffffff", color: "#111827", fontFamily: "Arial, sans-serif", fontSize: "16px",
  });

  const header = document.createElement("header");
  header.dataset.pdfHeader = "true";
  Object.assign(header.style, { display: "grid", gridTemplateColumns: "130px 1fr 160px", alignItems: "center", gap: "16px", borderBottom: "1px solid #111827", paddingBottom: "14px" });
  const logo = document.createElement("img");
  logo.src = "/images/logo-azg.jpeg";
  logo.alt = "AZG";
  Object.assign(logo.style, { width: "112px", height: "64px", objectFit: "contain" });
  const title = document.createElement("strong");
  title.textContent = "AZG MERKEZ GÜNLÜK İMALAT";
  Object.assign(title.style, { textAlign: "center", fontSize: "22px" });
  const dateLabelElement = document.createElement("strong");
  dateLabelElement.textContent = `Tarih: ${dateLabel}`;
  Object.assign(dateLabelElement.style, { textAlign: "right", fontSize: "15px" });
  header.append(logo, title, dateLabelElement);
  root.appendChild(header);

  entries.forEach((entry) => {
    const team = document.createElement("section");
    team.dataset.pdfTeam = "true";
    team.dataset.teamName = entry.team_leader_name_snapshot;
    Object.assign(team.style, { marginTop: "20px", border: "1px solid #111827", background: "#ffffff", boxSizing: "border-box" });
    const teamTitle = document.createElement("div");
    teamTitle.textContent = `TARİH: ${formatPdfDate(entry.work_date)}  ·  EKİP ADI: ${entry.team_leader_name_snapshot}`;
    Object.assign(teamTitle.style, { padding: "10px 14px", borderBottom: "2px solid #111827", background: "#f1f5f9", fontWeight: "700" });
    team.appendChild(teamTitle);
    const jobs = document.createElement("div");
    Object.assign(jobs.style, { padding: "12px" });
    entry.jobs.forEach((job, jobIndex) => {
      const jobBlock = document.createElement("div");
      jobBlock.dataset.pdfJob = "true";
      Object.assign(jobBlock.style, { border: "1px solid #111827", padding: "12px", marginBottom: jobIndex === entry.jobs.length - 1 ? "0" : "12px" });
      const jobHeader = document.createElement("div");
      Object.assign(jobHeader.style, { display: "flex", justifyContent: "space-between", gap: "16px", borderBottom: "1px solid #111827", paddingBottom: "8px", marginBottom: "8px", fontWeight: "700" });
      const jobName = document.createElement("span");
      jobName.textContent = `İŞ / PROJE ${jobIndex + 1}`;
      const jobId = document.createElement("span");
      jobId.textContent = `ID: ${job.project_code_snapshot || "-"}`;
      jobHeader.append(jobName, jobId);
      const projectTitle = document.createElement("div");
      projectTitle.textContent = job.project_name_snapshot;
      Object.assign(projectTitle.style, { textAlign: "center", fontWeight: "700", fontSize: "17px", marginBottom: "10px" });
      const list = document.createElement("div");
      Object.assign(list.style, { display: "grid", gap: "7px" });
      job.items.forEach((item, itemIndex) => {
        const line = document.createElement("div");
        line.dataset.pdfItem = "true";
        Object.assign(line.style, { display: "grid", gridTemplateColumns: "32px 1fr", alignItems: "start", lineHeight: "1.45" });
        const lineNumber = document.createElement("strong");
        lineNumber.textContent = `${itemIndex + 1}:`;
        const description = document.createElement("span");
        description.textContent = item.unit_snapshot === "SATIR" && Number(item.quantity) === 1
          ? item.item_name_snapshot
          : `${item.item_name_snapshot} — ${Number(item.quantity).toLocaleString("tr-TR")} ${item.unit_snapshot}`;
        Object.assign(description.style, { whiteSpace: "pre-wrap", overflowWrap: "anywhere" });
        line.append(lineNumber, description);
        list.appendChild(line);
      });
      jobBlock.append(jobHeader, projectTitle, list);
      jobs.appendChild(jobBlock);
    });
    team.appendChild(jobs);
    root.appendChild(team);
  });
  return root;
}

function formatPdfDate(date: string) {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${day}.${month}.${year}` : date;
}
