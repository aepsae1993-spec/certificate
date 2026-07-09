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
  teacher: string;
  title: string;
  event_date: string | null;
  organizer: string | null;
  hours: number | null;
  file_url: string;
};

const DIRECTOR = "นายณรงค์ เนตรลา"; // ผู้อำนวยการ (คงที่)
const LOGO_URL =
  "https://hllulfnvwcrzsiwofqzx.supabase.co/storage/v1/object/public/logo/school-logo.png";

const RES = 16; // px ต่อ mm ในการ render canvas (ความคมชัด)
const THAI_COMBINING = /[ัำ-ฺ็-๎]/;

type TextImg = { dataUrl: string; wMm: number; hMm: number };

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
    if (out.length && THAI_COMBINING.test(ch)) {
      out[out.length - 1] += ch;
    } else {
      out.push(ch);
    }
  }
  return out;
}

function wrapLine(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxPx: number
): string[] {
  if (!isFinite(maxPx)) return [text];
  const clusters = toClusters(text);
  const lines: string[] = [];
  let cur = "";
  for (const c of clusters) {
    const test = cur + c;
    if (cur === "" || ctx.measureText(test).width <= maxPx) {
      cur = test;
    } else {
      lines.push(cur);
      cur = c;
    }
  }
  if (cur) lines.push(cur);
  return lines;
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

  const rawLines = text
    .split("\n")
    .flatMap((l) => wrapLine(mctx, l, maxPx));

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

  return {
    dataUrl: canvas.toDataURL("image/png"),
    wMm: widthPx / RES,
    hMm: heightPx / RES,
  };
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

function thaiDate(iso: string | null): string {
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

export async function generateTeacherReport(
  teacher: string,
  reporter: string,
  items: ReportItem[]
) {
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

  // คอลัมน์ตามตารางในแอป (รูปแนบ 2)
  const headLabels = [
    "ลำดับที่",
    "ชื่อหลักสูตร/โครงการ/กิจกรรม",
    "วัน/เดือน/ปี\nที่เข้าร่วมกิจกรรม",
    "หน่วยงานที่จัดอบรม",
    "จำนวนชั่วโมง\nการอบรม",
    "หลักฐาน",
  ];
  const colWidth = [14, 60, 26, 46, 18, 22];
  const align: ("left" | "center")[] = [
    "center",
    "left",
    "center",
    "left",
    "center",
    "center",
  ];
  const PAD = 2;
  const inner = (i: number) => colWidth[i] - PAD * 2;
  const QR_MM = 18;

  // เตรียมรูปหัวตาราง
  const headImgs = headLabels.map((t, i) =>
    renderText(t, {
      fontMm: 3.1,
      weight: "bold",
      color: "#241c05",
      align: "center",
      maxWidthMm: inner(i),
    })
  );
  const headRowH = Math.max(...headImgs.map((h) => h.hMm)) + 3;

  // เตรียมรูปแต่ละเซลล์ + ความสูงแต่ละแถว
  const cellImgs: (TextImg | null)[][] = [];
  const rowH: number[] = [];
  items.forEach((it, r) => {
    const row: (TextImg | null)[] = [
      renderText(String(r + 1), { fontMm: 3.2, align: "center", maxWidthMm: inner(0) }),
      renderText(it.title, { fontMm: 3.2, align: "left", maxWidthMm: inner(1) }),
      renderText(thaiDate(it.event_date), {
        fontMm: 3.2,
        align: "center",
        maxWidthMm: inner(2),
      }),
      renderText(it.organizer || "-", {
        fontMm: 3.2,
        align: "left",
        maxWidthMm: inner(3),
      }),
      renderText(it.hours != null ? `${it.hours} ชั่วโมง` : "-", {
        fontMm: 3.2,
        align: "center",
        maxWidthMm: inner(4),
      }),
      null, // หลักฐาน = QR
    ];
    cellImgs.push(row);
    const textH = Math.max(...row.filter(Boolean).map((c) => (c as TextImg).hMm));
    rowH.push(Math.max(textH, QR_MM) + 3);
  });

  // ข้อความหัว/ท้ายหน้า (เตรียมครั้งเดียว)
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

  const totalHours = items.reduce((s, it) => s + (it.hours || 0), 0);
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
      colWidth.map((w, i) => [i, { cellWidth: w }])
    ) as any,
    head: [headLabels.map(() => "")],
    body: items.map(() => ["", "", "", "", "", ""]),
    didParseCell: (data: any) => {
      if (data.section === "head") data.cell.styles.minCellHeight = headRowH;
      if (data.section === "body")
        data.cell.styles.minCellHeight = rowH[data.row.index];
    },
    didDrawCell: (data: any) => {
      const col = data.column.index;
      if (data.section === "head") {
        place(headImgs[col], data.cell, "center");
        return;
      }
      if (data.section === "body") {
        if (col === 5) {
          const qr = qrByRow[data.row.index];
          if (qr) {
            const x = data.cell.x + (data.cell.width - QR_MM) / 2;
            const y = data.cell.y + (data.cell.height - QR_MM) / 2;
            doc.addImage(qr, "PNG", x, y, QR_MM, QR_MM);
          }
        } else {
          const img = cellImgs[data.row.index][col];
          if (img) place(img, data.cell, align[col]);
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
        const t1 = renderText("รายงานการเข้าร่วมอบรมและพัฒนาตนเอง", {
          fontMm: 5.4,
          weight: "bold",
          color: "#241c05",
          align: "center",
        });
        doc.addImage(t1.dataUrl, "PNG", (pageWidth - t1.wMm) / 2, titleY, t1.wMm, t1.hMm);
        const t2 = renderText("โรงเรียนวัดบางขุด (อุ่นพิทยาคาร)", {
          fontMm: 4.1,
          weight: "bold",
          color: "#3a3a3a",
          align: "center",
        });
        doc.addImage(
          t2.dataUrl,
          "PNG",
          (pageWidth - t2.wMm) / 2,
          titleY + 7.5,
          t2.wMm,
          t2.hMm
        );
        const t3 = renderText(
          `ชื่อครู: ${teacher}      จำนวน ${items.length} รายการ      รวม ${totalHours} ชั่วโมง`,
          { fontMm: 3.5, color: "#222", align: "center" }
        );
        doc.addImage(
          t3.dataUrl,
          "PNG",
          (pageWidth - t3.wMm) / 2,
          titleY + 14.5,
          t3.wMm,
          t3.hMm
        );
      }
    },
  });

  // ---------- บล็อกลงนาม (อยู่รวมกันเสมอ + เว้นระยะให้เซ็นได้) ----------
  const blockHeight = 52;
  let y = (doc as any).lastAutoTable.finalY + 22; // เว้นห่างจากตารางให้เซ็นได้
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

  signBlock(leftX, reporter || teacher, ["ผู้รายงาน"]);
  signBlock(rightX, DIRECTOR, [
    "ผู้อำนวยการโรงเรียนวัดบางขุด",
    "(อุ่นพิทยาคาร)",
  ]);

  // ---------- เลขหน้า มุมบนขวา (คำนวณจริง 1/2, 2/2) ----------
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const pn = renderText(`หน้า ${i}/${total}`, { fontMm: 2.9, color: "#5b5b5b" });
    doc.addImage(
      pn.dataUrl,
      "PNG",
      pageWidth - margin.right - pn.wMm,
      6,
      pn.wMm,
      pn.hMm
    );
  }

  const safe = teacher.replace(/[\\/:*?"<>|]/g, "_");
  doc.save(`รายงานอบรม-${safe}.pdf`);
}
