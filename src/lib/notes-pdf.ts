import type { SharedNote } from "@/types/note";

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 14;
const RENDER_WIDTH_PX = 760;

export async function downloadNotesPdf(notes: SharedNote[]) {
  if (!notes.length) throw new Error("PDF oluşturmak için en az bir not bulunmalıdır");

  const [{ default: jsPDF }, { toPng }] = await Promise.all([
    import("jspdf"),
    import("html-to-image"),
  ]);
  const root = buildNotesDom(notes);
  document.body.appendChild(root);

  try {
    await document.fonts.ready;
    await nextPaint();
    const imageUrl = await toPng(root, { backgroundColor: "#ffffff", pixelRatio: 2, cacheBust: true });
    const image = await loadImage(imageUrl);
    const availableWidth = A4_WIDTH_MM - MARGIN_MM * 2;
    const availableHeight = A4_HEIGHT_MM - MARGIN_MM * 2;
    const naturalHeight = (image.height / image.width) * availableWidth;
    const scale = Math.min(1, availableHeight / naturalHeight);
    const width = availableWidth * scale;
    const height = naturalHeight * scale;
    const x = (A4_WIDTH_MM - width) / 2;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    pdf.addImage(imageUrl, "PNG", x, MARGIN_MM, width, height, undefined, "FAST");
    pdf.save(`AZG-Notlar-${todayFileName()}.pdf`);
  } finally {
    root.remove();
  }
}

function buildNotesDom(notes: SharedNote[]) {
  const root = document.createElement("section");
  Object.assign(root.style, {
    position: "absolute",
    left: "0",
    top: "0",
    zIndex: "-9999",
    pointerEvents: "none",
    width: `${RENDER_WIDTH_PX}px`,
    boxSizing: "border-box",
    padding: "34px",
    background: "#ffffff",
    color: "#111827",
    fontFamily: "Arial, sans-serif",
  });

  const header = document.createElement("header");
  Object.assign(header.style, { borderBottom: "3px solid #111827", paddingBottom: "16px", marginBottom: "22px", textAlign: "center" });
  const title = document.createElement("h1");
  title.textContent = "AZG İLETİŞİM · NOTLAR";
  Object.assign(title.style, { margin: "0", fontSize: "25px", fontWeight: "700" });
  const created = document.createElement("p");
  created.textContent = `Çıktı tarihi: ${new Intl.DateTimeFormat("tr-TR").format(new Date())}`;
  Object.assign(created.style, { margin: "8px 0 0", fontSize: "13px", color: "#4b5563" });
  header.append(title, created);

  const list = document.createElement("div");
  Object.assign(list.style, { display: "grid" });
  notes.forEach((note) => {
    const row = document.createElement("div");
    Object.assign(row.style, { display: "grid", gridTemplateColumns: "22px 1fr", gap: "4px", padding: "12px 4px", borderBottom: "1px solid #d1d5db", fontSize: "17px", lineHeight: "1.4" });
    const bullet = document.createElement("strong");
    bullet.textContent = "•";
    const text = document.createElement("span");
    text.textContent = `${note.title} (${formatNoteDate(note.note_date)})`;
    Object.assign(text.style, { overflowWrap: "anywhere" });
    row.append(bullet, text);
    list.appendChild(row);
  });

  root.append(header, list);
  return root;
}

function formatNoteDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}.${month}.${year}` : value;
}

function todayFileName() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Notlar PDF görseli hazırlanamadı"));
    image.src = url;
  });
}

function nextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
