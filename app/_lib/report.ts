// สร้างรายงาน PDF ฝั่ง client ด้วย jsPDF + ฟอนต์ไทย Sarabun + QR
// เงื่อนไขการแบ่งหน้า:
//  - หัวตารางซ้ำทุกหน้า (showHead: 'everyPage')
//  - แถวข้อมูล + QR ไม่ถูกตัดครึ่ง (rowPageBreak: 'avoid')
//  - บล็อกลงนามอยู่รวมกันเสมอ ไปท้ายตารางหน้าสุดท้าย
//  - เลขหน้ามุมบนขวา 1/2, วันที่-เวลาบนซ้าย, พิมพ์เมื่อล่างขวา ครบทุกหน้า
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

// แคชฟอนต์ base64 ไว้ใช้ซ้ำ
let fontCache: { regular: string; bold: string } | null = null;

async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function loadFonts() {
  if (fontCache) return fontCache;
  const [regular, bold] = await Promise.all([
    fetchFontBase64("/fonts/Sarabun-Regular.ttf"),
    fetchFontBase64("/fonts/Sarabun-Bold.ttf"),
  ]);
  fontCache = { regular, bold };
  return fontCache;
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
    d.toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }) +
    " " +
    d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) +
    " น."
  );
}

export async function generateTeacherReport(teacher: string, items: ReportItem[]) {
  const fonts = await loadFonts();

  // สร้าง QR ของแต่ละแถวล่วงหน้า (async) แล้วค่อยวาดในตาราง
  const qrByRow: string[] = await Promise.all(
    items.map((it) =>
      it.file_url
        ? QRCode.toDataURL(it.file_url, { margin: 0, width: 220 })
        : Promise.resolve("")
    )
  );

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  doc.addFileToVFS("Sarabun-Regular.ttf", fonts.regular);
  doc.addFont("Sarabun-Regular.ttf", "Sarabun", "normal");
  doc.addFileToVFS("Sarabun-Bold.ttf", fonts.bold);
  doc.addFont("Sarabun-Bold.ttf", "Sarabun", "bold");
  doc.setFont("Sarabun", "normal");

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = { top: 24, left: 12, right: 12, bottom: 18 };

  const now = new Date();
  const nowShort = shortDateTime(now);
  const printedText = "พิมพ์เมื่อ " + fullThaiDateTime(now);
  const totalHours = items.reduce((s, it) => s + (it.hours || 0), 0);

  // วาดกรอบหัว-ท้ายของแต่ละหน้า (วันที่-เวลาบนซ้าย, พิมพ์เมื่อล่างขวา)
  const drawChrome = () => {
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(nowShort, margin.left, 10);
    doc.text(printedText, pageWidth - margin.right, pageHeight - 8, {
      align: "right",
    });
    doc.setTextColor(0);
  };

  autoTable(doc, {
    startY: 44, // เว้นที่หัวรายงานในหน้าแรก
    margin,
    showHead: "everyPage",
    rowPageBreak: "avoid", // ไม่ตัดแถวครึ่งข้ามหน้า
    theme: "grid",
    styles: {
      font: "Sarabun",
      fontStyle: "normal",
      fontSize: 10,
      cellPadding: 2.5,
      valign: "middle",
      lineColor: [180, 150, 60],
      lineWidth: 0.2,
      textColor: 20,
    },
    headStyles: {
      font: "Sarabun",
      fontStyle: "bold",
      fillColor: [212, 175, 55],
      textColor: 20,
      halign: "center",
      valign: "middle",
    },
    columnStyles: {
      0: { halign: "center", cellWidth: 16 },
      1: { cellWidth: 68 },
      2: { cellWidth: 38 },
      3: { halign: "center", cellWidth: 30 },
      4: { halign: "center", valign: "middle", cellWidth: 34, minCellHeight: 28 },
    },
    head: [
      [
        "ลำดับที่",
        "ชื่อหลักสูตร/โครงการ/กิจกรรม",
        "ครูผู้เข้าอบรม",
        "วัน/เดือน/ปี",
        "หลักฐาน",
      ],
    ],
    body: items.map((it, i) => [
      String(i + 1),
      `${it.title}\nหน่วยงาน: ${it.organizer || "-"}  ·  ${
        it.hours != null ? it.hours + " ชั่วโมง" : "-"
      }`,
      it.teacher,
      thaiDate(it.event_date),
      "", // ช่อง QR จะวาดด้วย didDrawCell
    ]),
    // วาด QR ในคอลัมน์หลักฐาน
    didDrawCell: (data: any) => {
      if (data.section === "body" && data.column.index === 4) {
        const img = qrByRow[data.row.index];
        if (img) {
          const size = 22;
          const x = data.cell.x + (data.cell.width - size) / 2;
          const y = data.cell.y + (data.cell.height - size) / 2;
          doc.addImage(img, "PNG", x, y, size, size);
        }
      }
    },
    // หัวรายงาน (หน้าแรก) + กรอบทุกหน้า
    didDrawPage: (data: any) => {
      drawChrome();
      if (data.pageNumber === 1) {
        doc.setFont("Sarabun", "bold");
        doc.setFontSize(16);
        doc.text("รายงานการเข้าร่วมอบรมและพัฒนาตนเอง", pageWidth / 2, 18, {
          align: "center",
        });
        doc.setFontSize(12);
        doc.text("โรงเรียนวัดบางขุด (อุ่นพิทยาคาร)", pageWidth / 2, 26, {
          align: "center",
        });
        doc.setFont("Sarabun", "normal");
        doc.setFontSize(11);
        doc.text(
          `ชื่อครู: ${teacher}     จำนวน ${items.length} รายการ     รวม ${totalHours} ชั่วโมง`,
          pageWidth / 2,
          34,
          { align: "center" }
        );
      }
    },
  });

  // ---------- บล็อกลงนาม (อยู่รวมกันเสมอ) ----------
  const blockHeight = 46;
  let y = (doc as any).lastAutoTable.finalY + 14;
  if (y + blockHeight > pageHeight - margin.bottom) {
    doc.addPage();
    drawChrome();
    y = margin.top + 6;
  }

  const usable = pageWidth - margin.left - margin.right;
  const leftX = margin.left + usable * 0.27;
  const rightX = margin.left + usable * 0.75;

  doc.setFont("Sarabun", "normal");
  doc.setFontSize(11);

  const sig = (cx: number, role1: string, role2: string) => {
    doc.text("ลงชื่อ ..............................................", cx, y, {
      align: "center",
    });
    doc.text("( .............................................. )", cx, y + 10, {
      align: "center",
    });
    doc.text(role1, cx, y + 18, { align: "center" });
    if (role2) doc.text(role2, cx, y + 25, { align: "center" });
  };

  sig(leftX, "ผู้รายงาน", "");
  sig(rightX, "ผู้อำนวยการโรงเรียนวัดบางขุด", "(อุ่นพิทยาคาร)");

  // ---------- เลขหน้า มุมบนขวา (คำนวณจริง 1/2, 2/2) ----------
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("Sarabun", "normal");
    doc.setFontSize(9);
    doc.setTextColor(90);
    doc.text(`หน้า ${i}/${total}`, pageWidth - margin.right, 10, {
      align: "right",
    });
    doc.setTextColor(0);
  }

  const safeTeacher = teacher.replace(/[\\/:*?"<>|]/g, "_");
  doc.save(`รายงานอบรม-${safeTeacher}.pdf`);
}
