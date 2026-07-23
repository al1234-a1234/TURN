import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // نشغّل الmiddleware فقط على المسارات التي تحتاج جلسة/حماية.
  // صفحات العميل العامة (/ و /r/*) لا تمرّ به إطلاقًا → صفر اتصال مصادقة، ضغط أسرع بكثير.
  matcher: ["/dashboard/:path*"],
};
