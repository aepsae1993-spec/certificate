-- ============================================================
-- รันสคริปต์นี้ใน Supabase: เมนู SQL Editor > New query > วาง > Run
-- ============================================================

-- 1) ตารางเก็บข้อมูลเกียรติบัตร
create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  teacher text not null,
  title text not null,
  file_path text not null,
  file_url text not null,
  file_type text,
  created_at timestamptz not null default now()
);

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
