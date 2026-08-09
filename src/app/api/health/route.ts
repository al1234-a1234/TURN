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
  // العين العميقة: هل الوظائف الليلية حية؟ (0049 — تتساهل يومًا كاملًا
  // عمدًا فلا إنذارات كاذبة). راصد خارجي بكلمة مفتاحية cron_fresh":false
  // يكشف موت الكرونات خلال ٤٨ ساعة بلا أي وكيل.
  let cron_fresh = true;
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await supabase.rpc("health_snapshot");
    if (!error) {
      db = "ok";
      cron_fresh = Boolean((data as { cron_fresh?: boolean } | null)?.cron_fresh ?? true);
    }
  } catch { /* db تبقى fail */ }

  // قلم الكتابة حاضر؟ بعد سحب دوالّ الكتابة من anon (0093) صار مفتاح
  // الخدمة شرطًا لكلّ انضمامٍ وحجز — لا رفاهيةَ إشعارات. ونشرةٌ تفقده
  // تُقابل العميل برسالة فشلٍ لا يُفهم سببها، فيُعلَن هنا: قيمةٌ منطقيّة
  // لا سرّ فيها (لا تكشف المفتاح ولا طوله)، وراصدٌ خارجيّ يلتقط
  // writer":false قبل أن يلتقطها زبون.
  const writer = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const body = { ok: db === "ok" && writer, db, writer, cron_fresh, db_ms: Date.now() - started };
  // 503 عند سقوط القاعدة أو غياب قلم الكتابة — كلاهما يمنع العميل من أخذ
  // دوره. أمّا الكرونات الراكدة فإنذار كلمة مفتاحية لا «الموقع ساقط».
  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
