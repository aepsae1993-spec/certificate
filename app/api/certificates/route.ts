import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, BUCKET } from "@/lib/supabase";
import { TEACHERS } from "@/lib/teachers";

export const runtime = "nodejs";

// GET /api/certificates?teacher=ชื่อครู  -> รายการเกียรติบัตร (ถ้าไม่ระบุครูจะคืนทั้งหมด)
export async function GET(req: NextRequest) {
  try {
    const supabase = getServiceClient();
    const teacher = req.nextUrl.searchParams.get("teacher");

    let query = supabase
      .from("certificates")
      .select("*")
      // เรียงตามวันที่เข้าร่วมกิจกรรม จากเก่าไปใหม่ (วันที่มาก่อนอยู่บนสุด)
      .order("event_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (teacher) query = query.eq("teacher", teacher);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/certificates  (FormData: teacher, title, file) -> อัปโหลด + บันทึก
export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient();
    const form = await req.formData();

    const teacher = String(form.get("teacher") || "").trim();
    const title = String(form.get("title") || "").trim();
    const eventDate = String(form.get("event_date") || "").trim();
    const organizer = String(form.get("organizer") || "").trim();
    const hoursRaw = String(form.get("hours") || "").trim();
    const file = form.get("file") as File | null;

    if (!teacher || !TEACHERS.includes(teacher)) {
      return NextResponse.json({ error: "กรุณาเลือกชื่อครูให้ถูกต้อง" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "กรุณากรอกชื่อเกียรติบัตร" }, { status: 400 });
    }
    if (!file || file.size === 0) {
      return NextResponse.json({ error: "กรุณาเลือกไฟล์" }, { status: 400 });
    }

    const allowed = ["image/jpeg", "image/png"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json(
        { error: "รองรับเฉพาะไฟล์รูปภาพ JPG หรือ PNG เท่านั้น" },
        { status: 400 }
      );
    }

    const maxBytes = 10 * 1024 * 1024; // 10 MB
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "ไฟล์ต้องไม่เกิน 10 MB" }, { status: 400 });
    }

    let hours: number | null = null;
    if (hoursRaw) {
      const n = Number(hoursRaw);
      if (Number.isNaN(n) || n < 0) {
        return NextResponse.json({ error: "จำนวนชั่วโมงไม่ถูกต้อง" }, { status: 400 });
      }
      hours = n;
    }

    // ใช้ลำดับครูเป็นชื่อโฟลเดอร์ (ASCII) เพราะ Supabase Storage ไม่รองรับ key ภาษาไทย/เว้นวรรค
    const rawExt = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const ext = (rawExt || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const teacherIdx = TEACHERS.indexOf(teacher);
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = `teacher-${teacherIdx}/${safeName}`;

    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, arrayBuffer, {
        contentType: file.type,
        upsert: false,
      });
    if (uploadError) throw uploadError;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    const { data, error: insertError } = await supabase
      .from("certificates")
      .insert({
        teacher,
        title,
        event_date: eventDate || null,
        organizer: organizer || null,
        hours,
        file_path: filePath,
        file_url: pub.publicUrl,
        file_type: file.type,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/certificates?id=...  -> ลบเกียรติบัตร
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getServiceClient();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "ไม่พบ id" }, { status: 400 });
    }

    const { data: row, error: findError } = await supabase
      .from("certificates")
      .select("file_path")
      .eq("id", id)
      .single();
    if (findError) throw findError;

    if (row?.file_path) {
      await supabase.storage.from(BUCKET).remove([row.file_path]);
    }

    const { error: delError } = await supabase
      .from("certificates")
      .delete()
      .eq("id", id);
    if (delError) throw delError;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "ลบไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
