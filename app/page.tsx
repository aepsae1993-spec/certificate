"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

// วันที่แบบสั้น เช่น "18 มิ.ย. 68" (พ.ศ.)
function formatEventDate(iso: string | null) {
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

  const totalHours = useMemo(
    () => items.reduce((sum, c) => sum + (c.hours || 0), 0),
    [items]
  );

  // เมื่อดูทั้งหมด ให้แสดงคอลัมน์ชื่อครูเพิ่ม
  const showTeacherColumn = !filterTeacher;

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
      const fileInput = document.getElementById("file-input") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

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

  const colCount = showTeacherColumn ? 7 : 6;

  return (
    <div className="container">
      <header className="header">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/logo.png" alt="ตราโรงเรียน" />
        <h1>ระบบจัดเก็บเกียรติบัตรครู</h1>
        <p className="subtitle">โรงเรียนวัดบางขุด (อุ่นพิทยาคาร)</p>
        <div className="divider" />
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
            <label htmlFor="title">ชื่อหลักสูตร / โครงการ / กิจกรรม</label>
            <input
              id="title"
              type="text"
              placeholder="เช่น โครงการบ้านนักวิทยาศาสตร์น้อย"
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
              placeholder="เช่น สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร"
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
            <label htmlFor="file-input">ไฟล์รูปภาพ (JPG หรือ PNG เท่านั้น — ไม่เกิน 10 MB)</label>
            <input
              id="file-input"
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <button className="btn" type="submit" disabled={uploading}>
            {uploading ? "กำลังอัปโหลด..." : "อัปโหลดเกียรติบัตร"}
          </button>
        </form>
      </section>

      <section className="card">
        <h2>ทะเบียนเกียรติบัตร</h2>

        <div className="toolbar">
          <div className="field">
            <label htmlFor="filter">เลือกดูตามชื่อครู</label>
            <select
              id="filter"
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
            >
              <option value="">— ครูทั้งหมด —</option>
              {TEACHERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="summary">
          <div className="stat">
            <div className="label">{filterTeacher || "ครูทั้งหมด"}</div>
            <div className="value">
              {items.length} <small>รายการ</small>
            </div>
          </div>
          <div className="stat">
            <div className="label">รวมจำนวนชั่วโมงการอบรม</div>
            <div className="value">
              {totalHours.toLocaleString("th-TH")} <small>ชั่วโมง</small>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="empty">กำลังโหลด...</p>
        ) : items.length === 0 ? (
          <p className="empty">ยังไม่มีเกียรติบัตร</p>
        ) : (
          <div className="table-wrap">
            <table className="cert-table">
              <thead>
                <tr>
                  <th className="col-no">ลำดับ{"\n"}ที่</th>
                  {showTeacherColumn && <th>ชื่อครู</th>}
                  <th>ชื่อหลักสูตร/โครงการ/{"\n"}กิจกรรม</th>
                  <th>วัน/เดือน/ปี{"\n"}ที่เข้าร่วมกิจกรรม</th>
                  <th>หน่วยงานที่จัดอบรม</th>
                  <th>จำนวนชั่วโมง{"\n"}การอบรม</th>
                  <th>หลักฐาน</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => (
                  <tr key={c.id}>
                    <td className="col-no">{i + 1}</td>
                    {showTeacherColumn && <td>{c.teacher}</td>}
                    <td>{c.title}</td>
                    <td className="col-center">{formatEventDate(c.event_date)}</td>
                    <td>{c.organizer || "-"}</td>
                    <td className="col-hours">
                      {c.hours != null ? `${c.hours} ชั่วโมง` : "-"}
                    </td>
                    <td className="col-evidence">
                      <a
                        className="thumb-link"
                        href={c.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="เปิดดูเกียรติบัตร"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.file_url} alt={c.title} />
                      </a>
                      <br />
                      <button className="del-link" onClick={() => handleDelete(c.id)}>
                        ลบ
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="tfoot-row">
                  <td colSpan={colCount - 2} style={{ textAlign: "right" }}>
                    รวมจำนวนชั่วโมงการอบรมทั้งหมด
                  </td>
                  <td className="col-hours">{totalHours.toLocaleString("th-TH")} ชั่วโมง</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <p className="footer">ระบบจัดเก็บเกียรติบัตรครู · โรงเรียนวัดบางขุด (อุ่นพิทยาคาร)</p>
    </div>
  );
}
