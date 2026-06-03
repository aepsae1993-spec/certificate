import { NextRequest, NextResponse } from "next/server";
import { getServiceClient, BUCKET } from "@/lib/supabase";

export const runtime = "nodejs";

const TABLE = "school_certificates";

// GET /api/school-certificates -> รายการเกียรติบัตรโรงเรียนทั้งหมด
export async function GET() {
  try {
    const supabase = getServiceClient();
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("issue_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "เกิดข้อผิดพลาด";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/school-certificates (FormData: title, issue_date, issuer, file)
export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient();
    const form = await req.formData();

    const title = String(form.get("title") || "").trim();
    const issueDate = String(form.get("issue_date") || "").trim();
    const issuer = String(form.get("issuer") || "").trim();
    const file = form.get("file") as File | null;

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

    const rawExt = file.name.includes(".") ? file.name.split(".").pop() : "bin";
    const ext = (rawExt || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = `school/${safeName}`;

    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, arrayBuffer, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    const { data, error: insertError } = await supabase
      .from(TABLE)
      .insert({
        title,
        issue_date: issueDate || null,
        issuer: issuer || null,
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

// DELETE /api/school-certificates?id=...
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
      .from(TABLE)
      .select("file_path")
      .eq("id", id)
      .single();
    if (findError) throw findError;

    if (row?.file_path) {
      await supabase.storage.from(BUCKET).remove([row.file_path]);
    }

    const { error: delError } = await supabase.from(TABLE).delete().eq("id", id);
    if (delError) throw delError;

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "ลบไม่สำเร็จ";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
