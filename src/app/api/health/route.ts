import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

/**
 * نبض الصحة للرصد الخارجي — يجيب على سؤالين فقط:
 * هل التطبيق حيّ؟ وهل يرى قاعدته؟
 *
 * موجود لأن فحص «الرئيسية ترجع 200» كان يتطلّب الوصول للصفحة كاملة
 * (وبيئات الرصد قد تُحجب عنها أو تتأثر بوزنها)، ولأن راصدًا خارجيًّا
 * محايدًا (UptimeRobot ونحوه) يحتاج مسارًا رخيصًا مستقرًّا يدقّه كل دقيقة.
 *
 * عمدًا لا يكشف أرقامًا تجارية ولا أسماء — فقط حيّ/ميت وزمن القاعدة.
 * وعميل Supabase يُنشأ هنا بلا جلسات (nodeFetch مباشر) — لا كوكيز ولا حالة.
 */
export async function GET() {
  const started = Date.now();
  let db: "ok" | "fail" = "fail";
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    // أرخص استعلام ممكن يثبت أن PostgREST والقاعدة يستجيبان
    const { error } = await supabase.from("restaurants").select("id", { count: "exact", head: true }).limit(1);
    if (!error) db = "ok";
  } catch { /* db تبقى fail */ }

  const body = { ok: db === "ok", db, db_ms: Date.now() - started };
  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
