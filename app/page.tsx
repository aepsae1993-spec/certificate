"use client";

import { useCallback, useEffect, useState } from "react";
import { TEACHERS } from "@/lib/teachers";

type Certificate = {
  id: string;
  teacher: string;
  title: string;
  event_date: string | null;
  organizer: string | null;
  hours: number | null;
  file_url: string;
  file_type: string | null;
  created_at: string;
};

function formatEventDate(iso: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso + "T00:00:00").toLocaleDateString("th-TH", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function Home() {
  const [teacher, setTeacher] = useState("");
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [hours, setHours] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    null
  );

  const [filterTeacher, setFilterTeacher] = useState("");
  const [items, setItems] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const url = t
        ? `/api/certificates?teacher=${encodeURIComponent(t)}`
        : "/api/certificates";
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "โหลดข้อมูลไม่สำเร็จ");
      setItems(json.data || []);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "โหลดข้อมูลไม่สำเร็จ",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList(filterTeacher);
  }, [filterTeacher, loadList]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!teacher) return setMessage({ type: "error", text: "กรุณาเลือกชื่อครู" });
    if (!title.trim()) return setMessage({ type: "error", text: "กรุณากรอกชื่อเกียรติบัตร" });
    if (!file) return setMessage({ type: "error", text: "กรุณาเลือกไฟล์" });

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("teacher", teacher);
      fd.append("title", title.trim());
      fd.append("event_date", eventDate);
      fd.append("organizer", organizer.trim());
      fd.append("hours", hours);
      fd.append("file", file);

      const res = await fetch("/api/certificates", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "อัปโหลดไม่สำเร็จ");

      setMessage({ type: "success", text: "อัปโหลดเกียรติบัตรสำเร็จ ✅" });
      setTitle("");
      setEventDate("");
      setOrganizer("");
      setHours("");
      setFile(null);
      (document.getElementById("file-input") as HTMLInputElement | null)?.value &&
        ((document.getElementById("file-input") as HTMLInputElement).value = "");

      // ถ้ากำลังกรองครูคนนี้ หรือดูทั้งหมด ให้รีโหลด
      if (!filterTeacher || filterTeacher === teacher) {
        loadList(filterTeacher);
      } else {
        setFilterTeacher(teacher);
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "อัปโหลดไม่สำเร็จ",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("ต้องการลบเกียรติบัตรนี้ใช่หรือไม่?")) return;
    try {
      const res = await fetch(`/api/certificates?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ลบไม่สำเร็จ");
      setItems((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "ลบไม่สำเร็จ",
      });
    }
  }

  return (
    <div className="container">
      <header className="header">
        <h1>🏅 ระบบอัปโหลดเกียรติบัตรครู</h1>
        <p>เลือกชื่อของคุณ แล้วอัปโหลดไฟล์เกียรติบัตร (PDF หรือรูปภาพ)</p>
      </header>

      {message && <div className={`alert ${message.type}`}>{message.text}</div>}

      <section className="card">
        <h2>อัปโหลดเกียรติบัตร</h2>
        <form onSubmit={handleUpload}>
          <div className="field">
            <label htmlFor="teacher">ชื่อครู</label>
            <select
              id="teacher"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
            >
              <option value="">— เลือกชื่อครู —</option>
              {TEACHERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="title">ชื่อเกียรติบัตร / หัวข้อ</label>
            <input
              id="title"
              type="text"
              placeholder="เช่น อบรมหลักสูตรการสอนเชิงรุก ปี 2567"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="event_date">วัน/เดือน/ปี ที่เข้าร่วมกิจกรรม</label>
            <input
              id="event_date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="organizer">หน่วยงานที่จัดอบรม</label>
            <input
              id="organizer"
              type="text"
              placeholder="เช่น สพฐ. / มหาวิทยาลัย / หน่วยงานต้นสังกัด"
              value={organizer}
              onChange={(e) => setOrganizer(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="hours">จำนวนชั่วโมงการอบรม</label>
            <input
              id="hours"
              type="number"
              min="0"
              step="0.5"
              placeholder="เช่น 6"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="file-input">ไฟล์ (PDF, JPG, PNG, WEBP — ไม่เกิน 10 MB)</label>
            <input
              id="file-input"
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <button className="btn" type="submit" disabled={uploading}>
            {uploading ? "กำลังอัปโหลด..." : "อัปโหลด"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>เกียรติบัตรที่อัปโหลดแล้ว</h2>

        <div className="toolbar">
          <div className="field">
            <label htmlFor="filter">กรองตามชื่อครู</label>
            <select
              id="filter"
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
            >
              <option value="">— ทั้งหมด —</option>
              {TEACHERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <p className="empty">กำลังโหลด...</p>
        ) : items.length === 0 ? (
          <p className="empty">ยังไม่มีเกียรติบัตร</p>
        ) : (
          <div className="cert-list">
            {items.map((c) => (
              <div className="cert-item" key={c.id}>
                {c.file_type?.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="cert-thumb" src={c.file_url} alt={c.title} />
                ) : (
                  <div className="cert-thumb">📄</div>
                )}
                <div className="cert-info">
                  <div className="title">{c.title}</div>
                  <div className="meta">{c.teacher}</div>
                  <div className="meta">
                    {[
                      formatEventDate(c.event_date),
                      c.organizer,
                      c.hours != null ? `${c.hours} ชั่วโมง` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className="meta">อัปโหลด {formatDate(c.created_at)}</div>
                </div>
                <div className="cert-actions">
                  <a
                    className="link-btn"
                    href={c.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    เปิด/ดาวน์โหลด
                  </a>
                  <button
                    className="link-btn danger"
                    onClick={() => handleDelete(c.id)}
                  >
                    ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="footer">ระบบจัดเก็บเกียรติบัตรครู · ขับเคลื่อนด้วย Next.js + Supabase</p>
    </div>
  );
}
