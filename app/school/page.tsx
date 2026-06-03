"use client";

import { useCallback, useEffect, useState } from "react";
import SiteHeader from "@/app/_components/SiteHeader";

type SchoolCertificate = {
  id: string;
  title: string;
  issue_date: string | null;
  issuer: string | null;
  file_url: string;
  file_type: string | null;
  created_at: string;
};

function formatDate(iso: string | null) {
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

export default function SchoolPage() {
  const [title, setTitle] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [issuer, setIssuer] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(
    null
  );

  const [items, setItems] = useState<SchoolCertificate[]>([]);
  const [loading, setLoading] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/school-certificates");
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
    loadList();
  }, [loadList]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);

    if (!title.trim()) return setMessage({ type: "error", text: "กรุณากรอกชื่อเกียรติบัตร" });
    if (!file) return setMessage({ type: "error", text: "กรุณาเลือกไฟล์" });

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("title", title.trim());
      fd.append("issue_date", issueDate);
      fd.append("issuer", issuer.trim());
      fd.append("file", file);

      const res = await fetch("/api/school-certificates", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "อัปโหลดไม่สำเร็จ");

      setMessage(null);
      setSuccess(true);
      window.setTimeout(() => setSuccess(false), 2600);
      setTitle("");
      setIssueDate("");
      setIssuer("");
      setFile(null);
      const fileInput = document.getElementById("file-input") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

      loadList();
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
      const res = await fetch(`/api/school-certificates?id=${id}`, { method: "DELETE" });
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
            <div className="success-text">อัปโหลดเกียรติบัตรสำเร็จ</div>
            <div className="success-sub">บันทึกเข้าระบบเรียบร้อยแล้ว</div>
          </div>
        </div>
      )}

      <SiteHeader />

      {message && <div className={`alert ${message.type}`}>{message.text}</div>}

      <section className="card">
        <h2>อัปโหลดเกียรติบัตรโรงเรียน</h2>
        <form onSubmit={handleUpload}>
          <div className="field">
            <label htmlFor="title">ชื่อเกียรติบัตร</label>
            <input
              id="title"
              type="text"
              placeholder="เช่น รางวัลโรงเรียนคุณภาพ"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="issue_date">วัน/เดือน/ปี ที่ออก</label>
            <input
              id="issue_date"
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="issuer">หน่วยงานที่ออกเกียรติบัตร</label>
            <input
              id="issuer"
              type="text"
              placeholder="เช่น สำนักงานคณะกรรมการการศึกษาขั้นพื้นฐาน"
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
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
        <h2>ทะเบียนเกียรติบัตรโรงเรียน</h2>

        <div className="summary">
          <div className="stat">
            <div className="label">เกียรติบัตรทั้งหมด</div>
            <div className="value">
              {items.length} <small>รายการ</small>
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
                  <th>ชื่อเกียรติบัตร</th>
                  <th>วัน/เดือน/ปี{"\n"}ที่ออก</th>
                  <th>หน่วยงานที่ออกเกียรติบัตร</th>
                  <th>หลักฐาน</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c, i) => (
                  <tr key={c.id}>
                    <td className="col-no">{i + 1}</td>
                    <td>{c.title}</td>
                    <td className="col-center">{formatDate(c.issue_date)}</td>
                    <td>{c.issuer || "-"}</td>
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
            </table>
          </div>
        )}
      </section>

      <p className="footer">ระบบจัดเก็บเกียรติบัตรครู · โรงเรียนวัดบางขุด (อุ่นพิทยาคาร)</p>
    </div>
  );
}
