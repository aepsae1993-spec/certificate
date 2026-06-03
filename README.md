# ระบบอัปโหลดเกียรติบัตรครู 🏅

เว็บแอปสำหรับให้คุณครูเลือกชื่อตัวเองจาก dropdown แล้วอัปโหลดไฟล์เกียรติบัตร (PDF / รูปภาพ)
เก็บไฟล์และข้อมูลไว้ที่ **Supabase** และ deploy บน **Vercel** ผ่าน **GitHub**

สร้างด้วย: Next.js (App Router) + TypeScript + Supabase

---

## ฟีเจอร์
- เลือกชื่อครูจาก dropdown (แก้รายชื่อได้ที่ [`lib/teachers.ts`](lib/teachers.ts))
- อัปโหลดไฟล์ PDF, JPG, PNG, WEBP (ไม่เกิน 10 MB)
- ดูรายการ + กรองตามชื่อครู
- แสดงตัวอย่างรูป / เปิด / ดาวน์โหลด / ลบ

---

## ขั้นตอนที่ 1 — ตั้งค่า Supabase

1. ไปที่ https://supabase.com แล้วสร้างโปรเจกต์ใหม่ (ฟรี)
2. เข้าเมนู **SQL Editor** → **New query** → คัดลอกเนื้อหาในไฟล์
   [`supabase/schema.sql`](supabase/schema.sql) ทั้งหมดไปวาง → กด **Run**
   (จะสร้างตาราง `certificates` + bucket `certificates` ให้อัตโนมัติ)
3. เข้าเมนู **Project Settings → API** จดค่า 3 อย่างนี้:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (กดแสดง) → `SUPABASE_SERVICE_ROLE_KEY` ⚠️ เป็นความลับ

---

## ขั้นตอนที่ 2 — รันบนเครื่อง (ทดสอบ)

```bash
npm install
cp .env.example .env.local   # Windows PowerShell: copy .env.example .env.local
```

เปิดไฟล์ `.env.local` แล้วเติมค่า 3 อย่างจากขั้นตอนที่ 1 จากนั้น:

```bash
npm run dev
```

เปิดเบราว์เซอร์ที่ http://localhost:3000

---

## ขั้นตอนที่ 3 — ขึ้น GitHub

```bash
git init
git add .
git commit -m "ระบบอัปโหลดเกียรติบัตรครู"
git branch -M main
git remote add origin https://github.com/<ชื่อบัญชี>/<ชื่อ-repo>.git
git push -u origin main
```

> `.env.local` จะไม่ถูกอัปขึ้น GitHub เพราะอยู่ใน `.gitignore` แล้ว (ปลอดภัย)

---

## ขั้นตอนที่ 4 — Deploy บน Vercel

1. ไปที่ https://vercel.com → **Add New → Project** → เลือก repo จาก GitHub
2. Vercel จะตรวจเจอ Next.js ให้อัตโนมัติ (ไม่ต้องตั้งค่า build เพิ่ม)
3. ที่หน้า **Environment Variables** ใส่ค่า 3 ตัวให้ครบ:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | (จาก Supabase) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (จาก Supabase) |
   | `SUPABASE_SERVICE_ROLE_KEY` | (จาก Supabase) |

4. กด **Deploy** → เสร็จแล้วจะได้ลิงก์เว็บใช้งานได้ทันที

> ทุกครั้งที่ `git push` ขึ้น `main` Vercel จะ deploy เวอร์ชันใหม่ให้อัตโนมัติ

---

## การแก้ไขรายชื่อครู
แก้ที่ไฟล์ [`lib/teachers.ts`](lib/teachers.ts) แล้ว push ขึ้น GitHub ได้เลย

## หมายเหตุด้านความปลอดภัย
- การอัปโหลด/ลบ ทำผ่าน API route ฝั่งเซิร์ฟเวอร์ด้วย `service_role` key เท่านั้น
  คีย์ลับนี้จะไม่ถูกส่งไปฝั่งเบราว์เซอร์
- ระบบนี้ไม่มีการล็อกอิน (ใช้ dropdown เลือกชื่อ) เหมาะกับใช้งานภายในโรงเรียน
  หากต้องการความปลอดภัยเพิ่ม สามารถเพิ่มระบบล็อกอิน Supabase Auth ภายหลังได้
