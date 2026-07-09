// สร้างรายงาน PDF ฝั่ง client
// แก้ปัญหาภาษาไทย (สระ/วรรณยุกต์ซ้อน, คำขาด) โดย render ข้อความผ่าน canvas ของเบราว์เซอร์
// (ได้ Thai shaping ที่ถูกต้อง) แล้วฝังเป็นรูปลงใน jsPDF
//
// เงื่อนไขการแบ่งหน้า:
//  - หัวตารางซ้ำทุกหน้า, แถว+QR ไม่ถูกตัดครึ่ง, บล็อกลงนามอยู่รวมกันไม่แยกหน้า
//  - เลขหน้า 1/2 มุมขวาบน, วันที่-เวลาบนซ้าย, พิมพ์เมื่อล่างขวา ครบทุกหน้า
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";

export type ReportItem = {
  teacher?: string;
  title: string;
  event_date?: string | null;
  issue_date?: string | null;
  organizer?: string | null;
  issuer?: string | null;
  hours?: number | null;
  file_url: string;
};

const DIRECTOR = "นายณรงค์ เนตรลา"; // ผู้อำนวยการ (คงที่)
const SUBTITLE = "โรงเรียนวัดบางขุด (อุ่นพิทยาคาร)";
const LOGO_URL =
  "https://hllulfnvwcrzsiwofqzx.supabase.co/storage/v1/object/public/logo/school-logo.png";

const RES = 16; // px ต่อ mm ในการ render canvas (ความคมชัด)
const THAI_COMBINING = /[ัำ-ฺ็-๎]/;

type TextImg = { dataUrl: string; wMm: number; hMm: number };

type Column = {
  header: string;
  width: number;
  align: "left" | "center";
  value?: (it: ReportItem, index: number) => string;
  isQR?: boolean;
};

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx() {
  if (!measureCtx) {
    const c = document.createElement("canvas");
    measureCtx = c.getContext("2d");
  }
  return measureCtx!;
}

async function ensureFont() {
  try {
    await Promise.all([
      document.fonts.load('16px "Sarabun"'),
      document.fonts.load('bold 16px "Sarabun"'),
    ]);
    await document.fonts.ready;
  } catch {
    /* ใช้ฟอนต์สำรองถ้าโหลดไม่ได้ */
  }
}

// แบ่งเป็น cluster: ตัวอักษรฐาน + สระ/วรรณยุกต์ที่เกาะอยู่ (กันไม่ให้วรรณยุกต์หลุดขึ้นบรรทัดใหม่)
function toClusters(text: string): string[] {
  const out: string[] = [];
  for (const ch of Array.from(text)) {
    if (out.length && THAI_COMBINING.test(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

// แบ่งเป็น "คำ" ภาษาไทยด้วย Intl.Segmenter (V8 แบ่งคำไทยแบบพจนานุกรม)
let wordSeg: Intl.Segmenter | null | undefined;
function segmentWords(text: string): string[] {
  if (wordSeg === undefined) {
    try {
      wordSeg = new Intl.Segmenter("th", { granularity: "word" });
    } catch {
      wordSeg = null;
    }
  }
  if (!wordSeg) return toClusters(text);
  return Array.from(wordSeg.segment(text), (s) => s.segment);
}

// ตัดคำยาวเกินช่องด้วย cluster (กรณีคำเดียวกว้างเกินความกว้างคอลัมน์)
function breakLongWord(
  ctx: CanvasRenderingContext2D,
  word: string,
  maxPx: number
): string[] {
  const cl = toClusters(word);
  const out: string[] = [];
  let c = "";
  for (const ch of cl) {
    const t = c + ch;
    if (c === "" || ctx.measureText(t).width <= maxPx) c = t;
    else {
      out.push(c);
      c = ch;
    }
  }
  if (c) out.push(c);
  return out;
}

function wrapLine(ctx: CanvasRenderingContext2D, text: string, maxPx: number): string[] {
  if (!isFinite(maxPx)) return [text];
  const words = segmentWords(text);
  const lines: string[] = [];
  let cur = "";
  const pushCur = () => {
    const t = cur.trim();
    if (t !== "") lines.push(t);
    cur = "";
  };
  for (const w of words) {
    // ขึ้นบรรทัดใหม่เมื่อเติมคำนี้แล้วเกินความกว้าง
    if (cur !== "" && ctx.measureText(cur + w).width > maxPx) pushCur();
    if (ctx.measureText(w).width > maxPx) {
      // คำเดียวยาวเกินช่อง → ตัดตามตัวอักษร
      pushCur();
      const parts = breakLongWord(ctx, w, maxPx);
      for (let i = 0; i < parts.length - 1; i++) lines.push(parts[i].trim());
      cur = parts[parts.length - 1] || "";
    } else {
      cur += w;
    }
  }
  pushCur();
  return lines.length ? lines : [""];
}

function renderText(
  text: string,
  opts: {
    fontMm: number;
    weight?: "normal" | "bold";
    color?: string;
    align?: "left" | "center";
    maxWidthMm?: number;
  }
): TextImg {
  const { fontMm, weight = "normal", color = "#1a1a1a", align = "left" } = opts;
  const fontPx = fontMm * RES;
  const maxPx = opts.maxWidthMm ? opts.maxWidthMm * RES : Infinity;
  const fontSpec = `${weight === "bold" ? "bold " : ""}${fontPx}px "Sarabun", sans-serif`;

  const mctx = getMeasureCtx();
  mctx.font = fontSpec;

  const rawLines = text.split("\n").flatMap((l) => wrapLine(mctx, l, maxPx));

  const lineH = fontPx * 1.5;
  const topPad = fontPx * 0.42;
  const botPad = fontPx * 0.28;
  const widthPx = Math.max(
    1,
    Math.ceil(Math.max(...rawLines.map((l) => mctx.measureText(l).width)))
  );
  const heightPx = Math.ceil(rawLines.length * lineH + topPad + botPad);

  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext("2d")!;
  ctx.font = fontSpec;
  ctx.textBaseline = "top";
  ctx.fillStyle = color;
  rawLines.forEach((l, i) => {
    const lw = ctx.measureText(l).width;
    const x = align === "center" ? (widthPx - lw) / 2 : 0;
    ctx.fillText(l, x, topPad + i * lineH);
  });

  return { dataUrl: canvas.toDataURL("image/png"), wMm: widthPx / RES, hMm: heightPx / RES };
}

async function fetchAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("โหลดรูปไม่สำเร็จ");
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

function loadImageSize(dataUrl: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = dataUrl;
  });
}

export function thaiDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      year: "2-digit",
    });
  } catch {
    return iso;
  }
}

function shortDateTime(d: Date): string {
  const yy = (d.getFullYear() + 543) % 100;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()}/${d.getMonth() + 1}/${yy} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fullThaiDateTime(d: Date): string {
  return (
    d.toLocaleDateString("th-TH", { day: "numeric", month: "long", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) +
    " น."
  );
}

// ---------- ตัวสร้างรายงานกลาง ----------
async function buildReport(opts: {
  title: string;
  summaryLine: string;
  reporter: string;
  columns: Column[];
  items: ReportItem[];
  fileName: string;
}) {
  const { title, summaryLine, reporter, columns, items } = opts;
  await ensureFont();

  // โลโก้ (จาก Supabase; ถ้าไม่ได้ใช้ไฟล์ในเครื่อง)
  let logo: { dataUrl: string; w: number; h: number } | null = null;
  try {
    let dataUrl: string;
    try {
      dataUrl = await fetchAsDataUrl(LOGO_URL);
    } catch {
      dataUrl = await fetchAsDataUrl("/logo.png");
    }
    const size = await loadImageSize(dataUrl);
    logo = { dataUrl, w: size.w, h: size.h };
  } catch {
    logo = null;
  }

  const qrColIndex = columns.findIndex((c) => c.isQR);

  // QR ของแต่ละแถว
  const qrByRow: string[] = await Promise.all(
    items.map((it) =>
      it.file_url
        ? QRCode.toDataURL(it.file_url, { margin: 0, width: 240 })
        : Promise.resolve("")
    )
  );

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = { top: 18, left: 12, right: 12, bottom: 16 };
  const PAD = 2;
  const inner = (i: number) => columns[i].width - PAD * 2;
  const QR_MM = 18;

  // หัวตาราง
  const headImgs = columns.map((c, i) =>
    renderText(c.header, {
      fontMm: 3.1,
      weight: "bold",
      color: "#241c05",
      align: "center",
      maxWidthMm: inner(i),
    })
  );
  const headRowH = Math.max(...headImgs.map((h) => h.hMm)) + 3;

  // เซลล์ + ความสูงแต่ละแถว
  const cellImgs: (TextImg | null)[][] = [];
  const rowH: number[] = [];
  items.forEach((it, r) => {
    const row: (TextImg | null)[] = columns.map((c, i) =>
      c.isQR
        ? null
        : renderText(c.value ? c.value(it, r) : "", {
            fontMm: 3.2,
            align: c.align,
            maxWidthMm: inner(i),
          })
    );
    cellImgs.push(row);
    const heights = row.filter(Boolean).map((c) => (c as TextImg).hMm);
    const textH = heights.length ? Math.max(...heights) : 0;
    rowH.push(Math.max(textH, qrColIndex >= 0 ? QR_MM : 0) + 3);
  });

  // ข้อความหัว/ท้ายหน้า
  const now = new Date();
  const dateImg = renderText(shortDateTime(now), { fontMm: 2.9, color: "#5b5b5b" });
  const printedImg = renderText("พิมพ์เมื่อ " + fullThaiDateTime(now), {
    fontMm: 2.9,
    color: "#5b5b5b",
  });

  const place = (img: TextImg, cell: any, al: "left" | "center") => {
    const x = al === "center" ? cell.x + (cell.width - img.wMm) / 2 : cell.x + PAD;
    const y = cell.y + (cell.height - img.hMm) / 2;
    doc.addImage(img.dataUrl, "PNG", x, y, img.wMm, img.hMm);
  };

  const drawChrome = () => {
    doc.addImage(dateImg.dataUrl, "PNG", margin.left, 6, dateImg.wMm, dateImg.hMm);
    doc.addImage(
      printedImg.dataUrl,
      "PNG",
      pageWidth - margin.right - printedImg.wMm,
      pageHeight - 8,
      printedImg.wMm,
      printedImg.hMm
    );
  };

  const startY = logo ? 56 : 46;

  autoTable(doc, {
    startY,
    margin,
    showHead: "everyPage",
    rowPageBreak: "avoid",
    theme: "grid",
    styles: {
      cellPadding: { top: 1.5, right: PAD, bottom: 1.5, left: PAD },
      lineColor: [180, 150, 60],
      lineWidth: 0.2,
      minCellHeight: 8,
    },
    headStyles: { fillColor: [212, 175, 55], minCellHeight: headRowH },
    columnStyles: Object.fromEntries(
      columns.map((c, i) => [i, { cellWidth: c.width }])
    ) as any,
    head: [columns.map(() => "")],
    body: items.map(() => columns.map(() => "")),
    didParseCell: (data: any) => {
      if (data.section === "head") data.cell.styles.minCellHeight = headRowH;
      if (data.section === "body") data.cell.styles.minCellHeight = rowH[data.row.index];
    },
    didDrawCell: (data: any) => {
      const col = data.column.index;
      if (data.section === "head") {
        place(headImgs[col], data.cell, "center");
        return;
      }
      if (data.section === "body") {
        if (columns[col].isQR) {
          const qr = qrByRow[data.row.index];
          if (qr) {
            const x = data.cell.x + (data.cell.width - QR_MM) / 2;
            const y = data.cell.y + (data.cell.height - QR_MM) / 2;
            doc.addImage(qr, "PNG", x, y, QR_MM, QR_MM);
          }
        } else {
          const img = cellImgs[data.row.index][col];
          if (img) place(img, data.cell, columns[col].align);
        }
      }
    },
    didDrawPage: (data: any) => {
      drawChrome();
      if (data.pageNumber === 1) {
        if (logo) {
          const h = 22;
          const w = (logo.w / logo.h) * h;
          doc.addImage(logo.dataUrl, "PNG", (pageWidth - w) / 2, 7, w, h);
        }
        const titleY = logo ? 31 : 14;
        const t1 = renderText(title, {
          fontMm: 5.4,
          weight: "bold",
          color: "#241c05",
          align: "center",
        });
        doc.addImage(t1.dataUrl, "PNG", (pageWidth - t1.wMm) / 2, titleY, t1.wMm, t1.hMm);
        const t2 = renderText(SUBTITLE, {
          fontMm: 4.1,
          weight: "bold",
          color: "#3a3a3a",
          align: "center",
        });
        doc.addImage(t2.dataUrl, "PNG", (pageWidth - t2.wMm) / 2, titleY + 7.5, t2.wMm, t2.hMm);
        const t3 = renderText(summaryLine, { fontMm: 3.5, color: "#222", align: "center" });
        doc.addImage(t3.dataUrl, "PNG", (pageWidth - t3.wMm) / 2, titleY + 14.5, t3.wMm, t3.hMm);
      }
    },
  });

  // ---------- บล็อกลงนาม ----------
  const blockHeight = 52;
  let y = (doc as any).lastAutoTable.finalY + 22;
  if (y + blockHeight > pageHeight - margin.bottom) {
    doc.addPage();
    drawChrome();
    y = margin.top + 16;
  }

  const usable = pageWidth - margin.left - margin.right;
  const leftX = margin.left + usable * 0.27;
  const rightX = margin.left + usable * 0.75;

  const centerLine = (text: string, cx: number, yy: number, fontMm = 3.4) => {
    const img = renderText(text, { fontMm, color: "#1a1a1a", align: "center" });
    doc.addImage(img.dataUrl, "PNG", cx - img.wMm / 2, yy, img.wMm, img.hMm);
  };

  const signBlock = (cx: number, name: string, role: string[]) => {
    centerLine("ลงชื่อ ..............................................", cx, y);
    centerLine(`( ${name} )`, cx, y + 14);
    role.forEach((r, i) => centerLine(r, cx, y + 22 + i * 6.5));
  };

  signBlock(leftX, reporter, ["ผู้รายงาน"]);
  signBlock(rightX, DIRECTOR, ["ผู้อำนวยการโรงเรียนวัดบางขุด (อุ่นพิทยาคาร)"]);

  // ---------- เลขหน้า ----------
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const pn = renderText(`หน้า ${i}/${total}`, { fontMm: 2.9, color: "#5b5b5b" });
    doc.addImage(pn.dataUrl, "PNG", pageWidth - margin.right - pn.wMm, 6, pn.wMm, pn.hMm);
  }

  doc.save(opts.fileName);
}

const noCol: Column = {
  header: "ลำดับที่",
  width: 14,
  align: "center",
  value: (_it, i) => String(i + 1),
};
const qrCol: Column = { header: "หลักฐาน", width: 22, align: "center", isQR: true };

// รายงานเกียรติบัตรครู: mode 'training' (อบรม) | 'award' (รางวัล)
export async function generateTeacherReport(
  teacher: string,
  reporter: string,
  items: ReportItem[],
  mode: "training" | "award" = "training"
) {
  const safe = teacher.replace(/[\\/:*?"<>|]/g, "_");
  const totalHours = items.reduce((s, it) => s + (it.hours || 0), 0);

  if (mode === "award") {
    await buildReport({
      title: "รายงานเกียรติบัตร/รางวัลของครู",
      summaryLine: `ชื่อครู: ${teacher}      จำนวน ${items.length} รายการ`,
      reporter,
      items,
      fileName: `รายงานรางวัล-${safe}.pdf`,
      columns: [
        noCol,
        { header: "ชื่อเกียรติบัตร/รางวัล", width: 82, align: "left", value: (it) => it.title },
        {
          header: "วัน/เดือน/ปี\nที่ได้รับ",
          width: 28,
          align: "center",
          value: (it) => thaiDate(it.event_date),
        },
        {
          header: "หน่วยงานที่มอบ",
          width: 44,
          align: "left",
          value: (it) => it.organizer || "-",
        },
        qrCol,
      ],
    });
    return;
  }

  await buildReport({
    title: "รายงานการเข้าร่วมอบรมและพัฒนาตนเอง",
    summaryLine: `ชื่อครู: ${teacher}      จำนวน ${items.length} รายการ      รวม ${totalHours} ชั่วโมง`,
    reporter,
    items,
    fileName: `รายงานอบรม-${safe}.pdf`,
    columns: [
      noCol,
      {
        header: "ชื่อหลักสูตร/โครงการ/กิจกรรม",
        width: 60,
        align: "left",
        value: (it) => it.title,
      },
      {
        header: "วัน/เดือน/ปี\nที่เข้าร่วมกิจกรรม",
        width: 26,
        align: "center",
        value: (it) => thaiDate(it.event_date),
      },
      {
        header: "หน่วยงานที่จัดอบรม",
        width: 46,
        align: "left",
        value: (it) => it.organizer || "-",
      },
      {
        header: "จำนวนชั่วโมง\nการอบรม",
        width: 18,
        align: "center",
        value: (it) => (it.hours != null ? `${it.hours} ชั่วโมง` : "-"),
      },
      qrCol,
    ],
  });
}

// รายงานเกียรติบัตรของโรงเรียน
export async function generateSchoolReport(reporter: string, items: ReportItem[]) {
  await buildReport({
    title: "รายงานเกียรติบัตรของโรงเรียน",
    summaryLine: `จำนวน ${items.length} รายการ`,
    reporter,
    items,
    fileName: `รายงานเกียรติบัตรโรงเรียน.pdf`,
    columns: [
      noCol,
      { header: "ชื่อเกียรติบัตร", width: 82, align: "left", value: (it) => it.title },
      {
        header: "วัน/เดือน/ปี\nที่ได้รับ",
        width: 28,
        align: "center",
        value: (it) => thaiDate(it.issue_date),
      },
      {
        header: "หน่วยงานที่ออกเกียรติบัตร",
        width: 44,
        align: "left",
        value: (it) => it.issuer || "-",
      },
      qrCol,
    ],
  });
}
