import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, BUCKET } from "@/lib/supabase";
import { TEACHERS } from "@/lib/teachers";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const IMAGE_TYPES = ["image/jpeg", "image/png"];
const REPORT_TYPES = ["application/pdf", "image/jpeg", "image/png"];

type SupabaseClient = ReturnType<typeof getServiceClient>;

// อัปโหลดไฟล์ (ถ้ามี) คืน { path, url, type } หรือ null ถ้าไม่มีไฟล์; โยน error ถ้าไฟล์ผิดเงื่อนไข
async function uploadOptional(
  supabase: SupabaseClient,
  file: File | null,
  folder: string,
  allowedTypes: string[],
  typeError: string
): Promise<{ path: string; url: string; type: string } | null> {
  if (!file || file.size === 0) return null;
  if (!allowedTypes.includes(file.type)) throw new Error(typeError);
  if (file.size > MAX_BYTES) throw new Error("ไฟล์ต้องไม่เกิน 10 MB");

  const rawExt = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const ext = (rawExt || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${folder}/${safeName}`;

  const buffer = await file.arrayBuffer();
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: file.type, upsert: false });
  if (error) throw error;

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { path, url: pub.publicUrl, type: file.type };
}

function parseHours(raw: string, category: string): number | null {
  if (category === "award" || !raw) return null;
  const n = Number(raw);
  if (Number.isNaN(n) || n < 0) throw new Error("จำนวนชั่วโมงไม่ถูกต้อง");
  return n;
}

// GET /api/certificates?teacher=&category=&month=YYYY-MM
export async function GET(req: NextRequest) {
  try {
    const supabase = getServiceClient();
    const sp = req.nextUrl.searchParams;
    const teacher = sp.get("teacher");
    const category = sp.get("category");
    const month = sp.get("month"); // "YYYY-MM" สำหรับรายงานรายเดือน

    let query = supabase
      .from("certificates")
      .select("*")
      .order("event_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (teacher) query = query.eq("teacher", teacher);
    query = query.eq("category", category === "award" ? "award" : "training");

    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split("-").map(Number);
      const start = `${month}-01`;
      const next =
        m === 12
          ? `${y + 1}-01-01`
          : `${y}-${String(m + 1).padStart(2, "0")}-01`;
      query = query.gte("event_date", start).lt("event_date", next);
    }

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/certificates -> เพิ่มรายการ (บังคับแค่ ครู + ชื่อหลักสูตร; ไฟล์ไม่บังคับ)
export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient();
    const form = await req.formData();

    const teacher = String(form.get("teacher") || "").trim();
    const title = String(form.get("title") || "").trim();
    const eventDate = String(form.get("event_date") || "").trim();
    const organizer = String(form.get("organizer") || "").trim();
    const hoursRaw = String(form.get("hours") || "").trim();
    const category = String(form.get("category") || "training") === "award" ? "award" : "training";

    if (!teacher || !TEACHERS.includes(teacher)) {
      return NextResponse.json({ error: "กรุณาเลือกชื่อครูให้ถูกต้อง" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "กรุณากรอกชื่อหลักสูตร/เกียรติบัตร" }, { status: 400 });
    }

    const hours = parseHours(hoursRaw, category);
    const teacherIdx = TEACHERS.indexOf(teacher);

    const cert = await uploadOptional(
      supabase,
      form.get("file") as File | null,
      `teacher-${teacherIdx}`,
      IMAGE_TYPES,
      "ไฟล์เกียรติบัตรรองรับเฉพาะรูปภาพ JPG หรือ PNG"
    );
    const report = await uploadOptional(
      supabase,
      form.get("report_file") as File | null,
      `report-${teacherIdx}`,
      REPORT_TYPES,
      "ไฟล์รายงานการอบรมรองรับเฉพาะ PDF, JPG หรือ PNG"
    );

    const { data, error } = await supabase
      .from("certificates")
      .insert({
        teacher,
        title,
        event_date: eventDate || null,
        organizer: organizer || null,
        hours,
        category,
        file_path: cert?.path ?? null,
        file_url: cert?.url ?? null,
        file_type: cert?.type ?? null,
        report_file_path: report?.path ?? null,
        report_file_url: report?.url ?? null,
        report_file_type: report?.type ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "บันทึกไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// PATCH /api/certificates?id=... -> แก้ไขรายการ (ไม่ต้องใช้รหัส; ไฟล์ใหม่จะแทนของเดิม)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = getServiceClient();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ไม่พบ id" }, { status: 400 });

    const { data: existing, error: findError } = await supabase
      .from("certificates")
      .select("*")
      .eq("id", id)
      .single();
    if (findError) throw findError;

    const form = await req.formData();
    const teacher = String(form.get("teacher") || existing.teacher).trim();
    const title = String(form.get("title") || "").trim();
    const eventDate = String(form.get("event_date") || "").trim();
    const organizer = String(form.get("organizer") || "").trim();
    const hoursRaw = String(form.get("hours") || "").trim();
    const category = existing.category === "award" ? "award" : "training";

    if (!teacher || !TEACHERS.includes(teacher)) {
      return NextResponse.json({ error: "กรุณาเลือกชื่อครูให้ถูกต้อง" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "กรุณากรอกชื่อหลักสูตร/เกียรติบัตร" }, { status: 400 });
    }

    const hours = parseHours(hoursRaw, category);
    const teacherIdx = TEACHERS.indexOf(teacher);

    const update: Record<string, unknown> = {
      teacher,
      title,
      event_date: eventDate || null,
      organizer: organizer || null,
      hours,
    };

    // ไฟล์เกียรติบัตรใหม่ (ถ้ามี) แทนของเดิม
    const newCert = await uploadOptional(
      supabase,
      form.get("file") as File | null,
      `teacher-${teacherIdx}`,
      IMAGE_TYPES,
      "ไฟล์เกียรติบัตรรองรับเฉพาะรูปภาพ JPG หรือ PNG"
    );
    if (newCert) {
      if (existing.file_path) await supabase.storage.from(BUCKET).remove([existing.file_path]);
      update.file_path = newCert.path;
      update.file_url = newCert.url;
      update.file_type = newCert.type;
    }

    // ไฟล์รายงานการอบรมใหม่ (ถ้ามี) แทนของเดิม
    const newReport = await uploadOptional(
      supabase,
      form.get("report_file") as File | null,
      `report-${teacherIdx}`,
      REPORT_TYPES,
      "ไฟล์รายงานการอบรมรองรับเฉพาะ PDF, JPG หรือ PNG"
    );
    if (newReport) {
      if (existing.report_file_path)
        await supabase.storage.from(BUCKET).remove([existing.report_file_path]);
      update.report_file_path = newReport.path;
      update.report_file_url = newReport.url;
      update.report_file_type = newReport.type;
    }

    const { data, error } = await supabase
      .from("certificates")
      .update(update)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "แก้ไขไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// DELETE /api/certificates?id=...  -> ลบ (ต้องใช้รหัสผ่าน)
export async function DELETE(req: NextRequest) {
  try {
    const expected = process.env.DELETE_PASSWORD || "bangkhud";
    const provided = req.headers.get("x-delete-password") || "";
    if (provided !== expected) {
      return NextResponse.json({ error: "รหัสผ่านไม่ถูกต้อง" }, { status: 401 });
    }

    const supabase = getServiceClient();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ไม่พบ id" }, { status: 400 });

    const { data: row, error: findError } = await supabase
      .from("certificates")
      .select("file_path, report_file_path")
      .eq("id", id)
      .single();
    if (findError) throw findError;

    const toRemove = [row?.file_path, row?.report_file_path].filter(Boolean) as string[];
    if (toRemove.length) await supabase.storage.from(BUCKET).remove(toRemove);

    const { error: delError } = await supabase.from("certificates").delete().eq("id", id);
    if (delError) throw delError;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "ลบไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
