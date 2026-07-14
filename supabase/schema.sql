-- ============================================================
-- รันสคริปต์นี้ใน Supabase: เมนู SQL Editor > New query > วาง > Run
-- ============================================================

-- 1) ตารางเก็บข้อมูลเกียรติบัตร
create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  teacher text not null,
  title text not null,
  event_date date,            -- วัน/เดือน/ปี ที่เข้าร่วมกิจกรรม
  organizer text,             -- หน่วยงานที่จัดอบรม
  hours numeric,              -- จำนวนชั่วโมงการอบรม
  file_path text,             -- ไฟล์เกียรติบัตร (ไม่บังคับ)
  file_url text,
  file_type text,
  report_file_path text,      -- ไฟล์รายงานการอบรม (ไม่บังคับ)
  report_file_url text,
  report_file_type text,
  category text not null default 'training',
  created_at timestamptz not null default now()
);

-- ถ้าตารางมีอยู่แล้ว (สร้างไปก่อนหน้า) ให้เพิ่ม/แก้คอลัมน์
alter table public.certificates add column if not exists event_date date;
alter table public.certificates add column if not exists organizer text;
alter table public.certificates add column if not exists hours numeric;
-- ประเภทเกียรติบัตรครู: 'training' = อบรมและพัฒนาตนเอง, 'award' = รางวัลของครู
alter table public.certificates add column if not exists category text not null default 'training';
-- ไฟล์เกียรติบัตรเป็นตัวเลือก (ไม่บังคับ)
alter table public.certificates alter column file_path drop not null;
alter table public.certificates alter column file_url drop not null;
-- ไฟล์รายงานการอบรม (แนบเพิ่ม ไม่บังคับ)
alter table public.certificates add column if not exists report_file_path text;
alter table public.certificates add column if not exists report_file_url text;
alter table public.certificates add column if not exists report_file_type text;

create index if not exists certificates_teacher_idx on public.certificates (teacher);
create index if not exists certificates_created_idx on public.certificates (created_at desc);

-- 2) เปิด Row Level Security
alter table public.certificates enable row level security;

-- อนุญาตให้ทุกคน "อ่าน" รายการได้ (ใช้กับ anon key ฝั่งหน้าเว็บ)
drop policy if exists "อ่านได้ทุกคน" on public.certificates;
create policy "อ่านได้ทุกคน"
  on public.certificates for select
  to anon, authenticated
  using (true);

-- หมายเหตุ: การเพิ่ม/ลบ ทำผ่าน API route ฝั่งเซิร์ฟเวอร์ด้วย service_role key
-- ซึ่งข้าม RLS อยู่แล้ว จึงไม่ต้องสร้าง policy สำหรับ insert/delete

-- ============================================================
-- 3) สร้าง Storage bucket ชื่อ "certificates" (แบบ public)
--    ทำผ่านหน้าเว็บ: Storage > New bucket > ชื่อ "certificates" > เปิด Public
--    หรือรัน SQL ด้านล่างนี้แทนก็ได้
-- ============================================================
insert into storage.buckets (id, name, public)
values ('certificates', 'certificates', true)
on conflict (id) do update set public = true;

-- อนุญาตให้อ่านไฟล์ใน bucket ได้แบบสาธารณะ
drop policy if exists "อ่านไฟล์เกียรติบัตรได้ทุกคน" on storage.objects;
create policy "อ่านไฟล์เกียรติบัตรได้ทุกคน"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'certificates');

-- ============================================================
-- 4) ตารางเกียรติบัตรของโรงเรียน (ไม่ผูกกับครูรายคน)
-- ============================================================
create table if not exists public.school_certificates (
  id uuid primary key default gen_random_uuid(),
  title text not null,        -- ชื่อเกียรติบัตร
  issue_date date,            -- วัน/เดือน/ปี ที่ออก
  issuer text,                -- หน่วยงานที่ออกเกียรติบัตร
  file_path text not null,
  file_url text not null,
  file_type text,
  created_at timestamptz not null default now()
);

create index if not exists school_certificates_issue_idx
  on public.school_certificates (issue_date);

alter table public.school_certificates enable row level security;

drop policy if exists "อ่านเกียรติบัตรโรงเรียนได้ทุกคน" on public.school_certificates;
create policy "อ่านเกียรติบัตรโรงเรียนได้ทุกคน"
  on public.school_certificates for select
  to anon, authenticated
  using (true);
