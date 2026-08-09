import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // قلم الكتابة يعمل؟ — لا «هل المتغيّر موجود؟»
  //
  // كان هنا `Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)`، فقال
  // `writer: true` بينما القيمة ليست مفتاح خدمة أصلًا؛ ثم سُحبت دوالّ
  // الكتابة من الضيف اعتمادًا على هذه الشهادة، فانكسر المسار في الإنتاج.
  // بوّابةٌ تفحص حضور شيءٍ بدل أن تختبر عملَه ليست بوّابة.
  //
  // فالآن ينادي مسبارًا لا يملك تنفيذه إلا `service_role`. نجاحُه يعني
  // أنّ المفتاح مفتاح خدمةٍ يقينًا — لا ظنًّا.
  let writer = false;
  // ولماذا فشل؟ — الحارس الذي يقول «لا» ولا يقول «لماذا» يترك صاحبه
  // يُخمّن، وقد خمّنتُ مرّتين فأخطأتُ مرّتين. فيُفصح عن سبب الرفض:
  //   • `probe_error` رسالة القاعدة (خطأ صلاحيّة؟ مفتاح مرفوض؟)
  //   • `key_kind` صنف المفتاح من بادئته وحدها — `sb_secret` أو
  //     `sb_publishable` أو `jwt` — بلا كشف حرفٍ من قيمته.
  //   • `url_set` لأنّ العميل الإداريّ يرجع null إن غاب العنوان أيضًا.
  let probe_error: string | null = null;
  const rawKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const key_kind = !rawKey
    ? "missing"
    : rawKey.startsWith("sb_secret_")
      ? "sb_secret"
      : rawKey.startsWith("sb_publishable_")
        ? "sb_publishable"
        : rawKey.startsWith("eyJ")
          ? "jwt_legacy"
          : "unknown";
  const url_set = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

  try {
    const admin = createAdminClient();
    if (!admin) {
      probe_error = "admin_client_null";
    } else {
      const { error } = await admin.rpc("service_role_probe");
      writer = !error;
      if (error) probe_error = `${error.code ?? "?"}: ${error.message ?? "?"}`.slice(0, 200);
    }
  } catch (e) {
    probe_error = e instanceof Error ? e.message.slice(0, 200) : "unknown";
  }

  const body = { ok: db === "ok", db, writer, key_kind, url_set, probe_error, cron_fresh, db_ms: Date.now() - started };
  // 503 عند سقوط القاعدة وحدها. وقد جعلتُ غياب قلم الكتابة يُسقطها أيضًا،
  // ثم تراجعت: ما دامت دوالّ الكتابة ممنوحةً للضيف (0093 متراجَعٌ عنه)
  // فالعميل يأخذ دوره والموقع قائم — وإعلانُه ساقطًا كذبٌ يعلّم صاحبه
  // تجاهل الإنذارات، وهو ما حذّرتُ منه ثم وقعتُ فيه.
  //
  // فـ`writer` و`cron_fresh` إنذارا كلمةٍ مفتاحية: يلتقطهما الراصد
  // ويُبلّغ، ولا يقولان «الموقع ساقط». ويوم يُعاد تطبيق 0093 يصير
  // `writer:false` انقطاعًا حقيقيًّا — وعندها يُرفع إلى 503 عمدًا.
  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
