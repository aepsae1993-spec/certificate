import { createClient } from "@supabase/supabase-js";

// ใช้เฉพาะฝั่งเซิร์ฟเวอร์ (API routes) เท่านั้น — มี service role key ห้ามส่งไปฝั่ง client
export function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

export const BUCKET = "certificates";
