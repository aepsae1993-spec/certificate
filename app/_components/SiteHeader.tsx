"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="header">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/logo.png" alt="ตราโรงเรียน" />
      <h1>ระบบจัดเก็บเกียรติบัตร</h1>
      <p className="subtitle">โรงเรียนวัดบางขุด (อุ่นพิทยาคาร)</p>
      <div className="divider" />

      <nav className="nav-tabs">
        <Link href="/" className={`nav-tab ${pathname === "/" ? "active" : ""}`}>
          เกียรติบัตรครู
        </Link>
        <Link
          href="/school"
          className={`nav-tab ${pathname === "/school" ? "active" : ""}`}
        >
          เกียรติบัตรโรงเรียน
        </Link>
      </nav>
    </header>
  );
}
