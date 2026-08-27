import { NextResponse } from "next/server";
import { guestWriter } from "@/lib/supabase/guest-writes";

export const dynamic = "force-dynamic";

/**
 * شبكة «مجهول المجهول» الأمامية — بلاغ انهيار المتصفح.
 *
 * كل فحوصنا ترى الخادم: صفحة ترجع ٢٠٠، دالة تنجح، قاعدة تنبض. وانهيار
 * الجافاسكربت يصير عند العميل وحده — زرٌّ ميت وشاشة خطأ وهو واقف على باب
 * المطعم، وكل لوحاتنا خضراء. حدُّا الخطأ (error/global-error) يبلّغان هنا،
 * والفحص الدوري يعدّ البلاغات: ٥ بلاغات بربع ساعة = تنبيه تيليجرام فوري.
 *
 * الحارس الحقيقي في القاعدة (log_client_error): سقف إغراقٍ صلب وقصّ أطوال —
 * فهذا المسار مفتوحٌ بلا مفتاح بحكم طبيعته (المتصفّح المنهار لا يملك جلسة).
 */
export async function POST(req: Request) {
  let body: { path?: unknown; message?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    // جسدٌ فاسد من متصفحٍ منهار أصلًا — نسجّل بلاغًا فارغ التفاصيل ولا نرمي
  }
  try {
    const db = await guestWriter();
    await db.rpc("log_client_error", {
      p_path: String(body.path ?? "").slice(0, 200),
      p_message: String(body.message ?? "").slice(0, 500),
      p_ua: (req.headers.get("user-agent") ?? "").slice(0, 300),
    });
  } catch {
    // فشل الإبلاغ لا يستحق ٥٠٠ — المتصفح المنهار لن يقرأها أصلًا
  }
  return NextResponse.json({ ok: true });
}
