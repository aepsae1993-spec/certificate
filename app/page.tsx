"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TEACHERS } from "@/lib/teachers";
import SiteHeader from "@/app/_components/SiteHeader";

type Category = "training" | "award";

type Certificate = {
  id: string;
  teacher: string;
  title: string;
  event_date: string | null;
  organizer: string | null;
  hours: number | null;
  file_url: string | null;
  file_type: string | null;
  report_file_url: string | null;
  report_file_type: string | null;
  created_at: string;
};

const LABELS: Record<Category, { title: string; date: string; org: string }> = {
  training: {
    title: "ชื่อหลักสูตร / โครงการ / กิจกรรม",
    date: "วัน/เดือน/ปี ที่เข้าร่วมกิจกรรม",
    org: "หน่วยงานที่จัดอบรม",
  },
  award: {
    title: "ชื่อเกียรติบัตร / รางวัล",
    date: "วัน/เดือน/ปี ที่ได้รับ",
    org: "หน่วยงานที่มอบ",
  },
};

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

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function Home() {
  const [category, setCategory] = useState<Category>("training");

  const [teacher, setTeacher] = useState("");
  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [hours, setHours] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [reportFile, setReportFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    null
  );

  const [filterTeacher, setFilterTeacher] = useState("");
  const [items, setItems] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reporter, setReporter] = useState("");

  const [monthlyMonth, setMonthlyMonth] = useState(thisMonth());
  const [monthlyReporter, setMonthlyReporter] = useState(TEACHERS[0]);
  const [monthlyReporting, setMonthlyReporting] = useState(false);

  const isTraining = category === "training";
  const L = LABELS[category];

  const loadList = useCallback(async (t: string, cat: Category) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/certificates?teacher=${encodeURIComponent(t)}&category=${cat}`
      );
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
    if (!filterTeacher) {
      setItems([]);
      return;
    }
    setReporter(filterTeacher);
    loadList(filterTeacher, category);
  }, [filterTeacher, category, loadList]);

  const totalHours = useMemo(
    () => items.reduce((sum, c) => sum + (c.hours || 0), 0),
    [items]
  );

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setEventDate("");
    setOrganizer("");
    setHours("");
    setFile(null);
    setReportFile(null);
    const f = document.getElementById("file-input") as HTMLInputElement | null;
    if (f) f.value = "";
    const rf = document.getElementById("report-file-input") as HTMLInputElement | null;
    if (rf) rf.value = "";
  }

  function startEdit(c: Certificate) {
    setEditingId(c.id);
    setTeacher(c.teacher);
    setTitle(c.title);
    setEventDate(c.event_date || "");
    setOrganizer(c.organizer || "");
    setHours(c.hours != null ? String(c.hours) : "");
    setFile(null);
    setReportFile(null);
    const f = document.getElementById("file-input") as HTMLInputElement | null;
    if (f) f.value = "";
    const rf = document.getElementById("report-file-input") as HTMLInputElement | null;
    if (rf) rf.value = "";
    setMessage(null);
    document.getElementById("upload-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!teacher) return setMessage({ type: "error", text: "กรุณาเลือกชื่อครู" });
    if (!title.trim())
      return setMessage({ type: "error", text: "กรุณากรอกชื่อหลักสูตร/เกียรติบัตร" });

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("teacher", teacher);
      fd.append("title", title.trim());
      fd.append("event_date", eventDate);
      fd.append("organizer", organizer.trim());
      fd.append("hours", isTraining ? hours : "");
      fd.append("category", category);
      if (file) fd.append("file", file);
      if (isTraining && reportFile) fd.append("report_file", reportFile);

      const url = editingId ? `/api/certificates?id=${editingId}` : "/api/certificates";
      const res = await fetch(url, { method: editingId ? "PATCH" : "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "บันทึกไม่สำเร็จ");

      const wasEditing = editingId;
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 2200);
      resetForm();

      if (wasEditing || filterTeacher === teacher) {
        loadList(teacher, category);
        if (filterTeacher !== teacher) setFilterTeacher(teacher);
      } else {
        setFilterTeacher(teacher);
      }
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "บันทึกไม่สำเร็จ",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleReport() {
    if (!filterTeacher || items.length === 0) return;
    setReporting(true);
    setMessage(null);
    try {
      const { generateTeacherReport } = await import("@/app/_lib/report");
      await generateTeacherReport(filterTeacher, reporter || filterTeacher, items, category);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "สร้างรายงานไม่สำเร็จ",
      });
    } finally {
      setReporting(false);
    }
  }

  async function handleMonthlyReport() {
    if (!monthlyMonth) return setMessage({ type: "error", text: "กรุณาเลือกเดือน" });
    setMonthlyReporting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/certificates?category=training&month=${monthlyMonth}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "โหลดข้อมูลไม่สำเร็จ");
      const data = json.data || [];
      if (data.length === 0) {
        setMessage({ type: "error", text: "เดือนที่เลือกไม่มีรายการอบรม" });
        return;
      }
      const { generateMonthlyReport } = await import("@/app/_lib/report");
      await generateMonthlyReport(monthlyReporter, monthlyMonth, data);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "สร้างรายงานไม่สำเร็จ",
      });
    } finally {
      setMonthlyReporting(false);
    }
  }

  async function handleDelete(id: string) {
    const pwd = prompt("กรุณาใส่รหัสผ่านเพื่อลบเกียรติบัตร");
    if (pwd === null) return;
    try {
      const res = await fetch(`/api/certificates?id=${id}`, {
        method: "DELETE",
        headers: { "x-delete-password": pwd },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ลบไม่สำเร็จ");
      setItems((prev) => prev.filter((c) => c.id !== id));
      if (editingId === id) resetForm();
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "ลบไม่สำเร็จ",
      });
    }
  }

  return (
    <div className="container">
      {success && (
        <div
          className="success-overlay"
          role="status"
          aria-live="polite"
          onClick={() => setSuccess(false)}
        >
          <div className="success-modal">
            <div className="success-check">
              <svg viewBox="0 0 52 52" width="64" height="64" aria-hidden="true">
                <circle className="sc-circle" cx="26" cy="26" r="24" />
                <path className="sc-tick" d="M14 27 l8 8 l16 -18" />
              </svg>
            </div>
            <div className="success-text">
              {editingId ? "บันทึกการแก้ไขสำเร็จ" : "บันทึกเกียรติบัตรสำเร็จ"}
            </div>
            <div className="success-sub">เรียบร้อยแล้ว</div>
          </div>
        </div>
      )}

      <SiteHeader />

      <div className="mode-switch-wrap">
        <div className="nav-tabs">
          <button
            className={`nav-tab ${isTraining ? "active" : ""}`}
            onClick={() => {
              setCategory("training");
              resetForm();
            }}
          >
            อบรมและพัฒนาตนเอง
          </button>
          <button
            className={`nav-tab ${!isTraining ? "active" : ""}`}
            onClick={() => {
              setCategory("award");
              resetForm();
            }}
          >
            รางวัลของครู
          </button>
        </div>
      </div>

      {message && <div className={`alert ${message.type}`}>{message.text}</div>}

      <section className="card" id="upload-card">
        <h2>
          {editingId
            ? "แก้ไขรายการ"
            : isTraining
            ? "เพิ่มเกียรติบัตรอบรม/พัฒนาตนเอง"
            : "เพิ่มเกียรติบัตร/รางวัลของครู"}
        </h2>
        <p className="form-hint">
          บังคับเฉพาะ <b>ชื่อครู</b> และ <b>ชื่อหลักสูตร/เกียรติบัตร</b> · ช่องอื่นเว้นว่างไว้
          แล้วกลับมาแก้ไขเพิ่มภายหลังได้
        </p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="teacher">ชื่อครู *</label>
            <select id="teacher" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
              <option value="">— เลือกชื่อครู —</option>
              {TEACHERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="title">{L.title} *</label>
            <input
              id="title"
              type="text"
              placeholder={
                isTraining
                  ? "เช่น โครงการบ้านนักวิทยาศาสตร์น้อย"
                  : "เช่น ครูดีเด่น ประจำปี 2569"
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="event_date">{L.date}</label>
            <input
              id="event_date"
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="organizer">{L.org}</label>
            <input
              id="organizer"
              type="text"
              placeholder={
                isTraining
                  ? "เช่น สำนักงานเขตพื้นที่การศึกษาประถมศึกษาสมุทรสาคร"
                  : "เช่น สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน"
              }
              value={organizer}
              onChange={(e) => setOrganizer(e.target.value)}
            />
          </div>

          {isTraining && (
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
          )}

          <div className="field">
            <label htmlFor="file-input">
              ไฟล์เกียรติบัตร — รูป JPG/PNG (ไม่บังคับ)
              {editingId && <span className="keep-note"> · ไม่เลือกใหม่ = ใช้ไฟล์เดิม</span>}
            </label>
            <input
              id="file-input"
              type="file"
              accept="image/jpeg,image/png"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {isTraining && (
            <div className="field">
              <label htmlFor="report-file-input">
                ไฟล์รายงานการอบรม — PDF/รูป (ไม่บังคับ)
                {editingId && <span className="keep-note"> · ไม่เลือกใหม่ = ใช้ไฟล์เดิม</span>}
              </label>
              <input
                id="report-file-input"
                type="file"
                accept="application/pdf,image/jpeg,image/png"
                onChange={(e) => setReportFile(e.target.files?.[0] ?? null)}
              />
            </div>
          )}

          <div className="form-actions">
            <button className="btn" type="submit" disabled={uploading}>
              {uploading
                ? "กำลังบันทึก..."
                : editingId
                ? "บันทึกการแก้ไข"
                : "บันทึกเกียรติบัตร"}
            </button>
            {editingId && (
              <button type="button" className="link-btn" onClick={resetForm}>
                ยกเลิกการแก้ไข
              </button>
            )}
          </div>
        </form>
      </section>

      {isTraining && (
        <section className="card">
          <h2>รายงานรายเดือน (ทั้งโรงเรียน)</h2>
          <p className="form-hint">
            เลือกผู้รายงานและเดือน → รวมครูทุกคนที่อบรมในเดือนนั้น เรียงตามวันที่
          </p>
          <div className="report-bar">
            <div className="field report-reporter">
              <label htmlFor="m-reporter">ผู้รายงาน</label>
              <select
                id="m-reporter"
                value={monthlyReporter}
                onChange={(e) => setMonthlyReporter(e.target.value)}
              >
                {TEACHERS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="field report-reporter">
              <label htmlFor="m-month">เดือน</label>
              <input
                id="m-month"
                type="month"
                value={monthlyMonth}
                onChange={(e) => setMonthlyMonth(e.target.value)}
              />
            </div>
            <button className="btn" onClick={handleMonthlyReport} disabled={monthlyReporting}>
              {monthlyReporting ? "กำลังสร้าง..." : "📄 รายงานรายเดือน"}
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>
          {isTraining
            ? "ทะเบียนเกียรติบัตรอบรม/พัฒนาตนเอง"
            : "ทะเบียนเกียรติบัตร/รางวัลของครู"}
        </h2>

        <div className="toolbar">
          <div className="field">
            <label htmlFor="filter">เลือกดูตามชื่อครู</label>
            <select
              id="filter"
              value={filterTeacher}
              onChange={(e) => setFilterTeacher(e.target.value)}
            >
              <option value="">— เลือกชื่อครู —</option>
              {TEACHERS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>

        {!filterTeacher ? (
          <p className="empty">กรุณาเลือกชื่อครูเพื่อดูทะเบียนเกียรติบัตร</p>
        ) : (
          <>
            <div className="summary">
              <div className="stat">
                <div className="label">{filterTeacher}</div>
                <div className="value">
                  {items.length} <small>รายการ</small>
                </div>
              </div>
              {isTraining && (
                <div className="stat">
                  <div className="label">รวมจำนวนชั่วโมงการอบรม</div>
                  <div className="value">
                    {totalHours.toLocaleString("th-TH")} <small>ชั่วโมง</small>
                  </div>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="report-bar">
                <div className="field report-reporter">
                  <label htmlFor="reporter">ผู้รายงาน (รายบุคคล)</label>
                  <select
                    id="reporter"
                    value={reporter}
                    onChange={(e) => setReporter(e.target.value)}
                  >
                    {TEACHERS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <button className="btn" onClick={handleReport} disabled={reporting}>
                  {reporting ? "กำลังสร้างรายงาน..." : "📄 รายงานรายบุคคล"}
                </button>
              </div>
            )}

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
                      <th>
                        {isTraining
                          ? "ชื่อหลักสูตร/โครงการ/กิจกรรม"
                          : "ชื่อเกียรติบัตร/รางวัล"}
                      </th>
                      <th>
                        วัน/เดือน/ปี{"\n"}
                        {isTraining ? "ที่เข้าร่วมกิจกรรม" : "ที่ได้รับ"}
                      </th>
                      <th>{isTraining ? "หน่วยงานที่จัดอบรม" : "หน่วยงานที่มอบ"}</th>
                      {isTraining && <th>จำนวนชั่วโมง{"\n"}การอบรม</th>}
                      <th>หลักฐาน</th>
                      {isTraining && <th>รายงาน{"\n"}การอบรม</th>}
                      <th>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((c, i) => (
                      <tr key={c.id}>
                        <td className="col-no">{i + 1}</td>
                        <td>{c.title}</td>
                        <td className="col-center">{formatEventDate(c.event_date)}</td>
                        <td>{c.organizer || "-"}</td>
                        {isTraining && (
                          <td className="col-hours">
                            {c.hours != null ? `${c.hours} ชั่วโมง` : "-"}
                          </td>
                        )}
                        <td className="col-evidence">
                          {c.file_url ? (
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
                          ) : (
                            <span className="muted-dash">-</span>
                          )}
                        </td>
                        {isTraining && (
                          <td className="col-center">
                            {c.report_file_url ? (
                              <a
                                className="link-btn"
                                href={c.report_file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                เปิด
                              </a>
                            ) : (
                              <span className="muted-dash">-</span>
                            )}
                          </td>
                        )}
                        <td className="col-center">
                          <div className="row-actions">
                            <button className="link-btn" onClick={() => startEdit(c)}>
                              แก้ไข
                            </button>
                            <button
                              className="link-btn danger"
                              onClick={() => handleDelete(c.id)}
                            >
                              ลบ
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {isTraining && (
                    <tfoot>
                      <tr className="tfoot-row">
                        <td colSpan={4} style={{ textAlign: "right" }}>
                          รวมจำนวนชั่วโมงการอบรมทั้งหมด
                        </td>
                        <td className="col-hours">
                          {totalHours.toLocaleString("th-TH")} ชั่วโมง
                        </td>
                        <td colSpan={3}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <p className="footer">ระบบจัดเก็บเกียรติบัตรครู · โรงเรียนวัดบางขุด (อุ่นพิทยาคาร)</p>
    </div>
  );
}
