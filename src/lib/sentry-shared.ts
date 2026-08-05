/**
 * إعداد Sentry المشترك — للعميل والخادم وحافة الشبكة.
 *
 * قاعدتان تحكمان هذا الملف:
 *
 * ١) **لا تغادر بياناتُ عميلٍ نظامَنا.** رسائل أخطائنا مليئة بأرقام الجوّالات
 *    (هي الهوية في هذا المنتج) وبالأسماء أحيانًا. إرسالها إلى خدمة خارجية
 *    مخالفةٌ لنظام حماية البيانات ولوعدنا للمطاعم. لذلك كل حدث يمرّ على منقٍّ
 *    يستبدل الأرقام والبُرد قبل الإرسال — في الرسالة، وفي المسار، وفي البيانات
 *    الإضافية، وفي فتات التتبّع.
 *
 * ٢) **الصمت أسوأ من الضجيج.** أصلحنا قريبًا ~١٧٠ موضعًا كانت تبتلع الأخطاء،
 *    وصارت تكتب console.error — لكنها تذهب إلى سجلّات لا يفتحها أحد.
 *    captureConsole يحوّلها كلها إلى تنبيهات حقيقية. فلا يبقى عطلٌ «مكتوبًا
 *    وغير مقروء».
 */

/** يُفعَّل فقط إذا وُجد العنوان — فبدونه لا شيء يُرسَل ولا شيء يتعطّل. */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN ?? "";
export const SENTRY_ENABLED = SENTRY_DSN.length > 0;

/** بيئة التشغيل كما تظهر في لوحة Sentry (production / preview / development) */
export const SENTRY_ENV =
  process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

/** إصدار الشيفرة — يربط الخطأ بالنشر الذي أحدثه */
export const SENTRY_RELEASE = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? undefined;

/* ── تنقية البيانات الشخصية ─────────────────────────────────────────────── */

const SAUDI_PHONE = /(?:\+?966|00966|0)?5\d{8}\b/g;
const ANY_LONG_DIGITS = /\b\d{9,15}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
/** مفاتيح Supabase لو تسرّبت في نصّ خطأ */
const TOKENISH = /\b(?:eyJ[\w-]{20,}|sb_[a-z]+_[\w-]{20,})/g;

/** يستبدل كل ما يدلّ على شخص بعلامةٍ محايدة، ويُبقي بقيّة النصّ مفهومًا. */
export function scrub(input: string): string {
  return input
    .replace(TOKENISH, "[سرّ]")
    .replace(EMAIL, "[بريد]")
    .replace(SAUDI_PHONE, "[جوّال]")
    .replace(ANY_LONG_DIGITS, "[رقم]");
}

/** تنقية عميقة لأي بنية (نصوص/مصفوفات/كائنات) مع حدّ عمق يمنع الدوران. */
function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // حقول لا قيمة تشخيصية لها وقيمتها كلّها شخصية — تُحذف لا تُنقّى
      if (/^(phone|full_name|name|email|customer_phone|customer_name)$/i.test(k)) {
        out[k] = "[محذوف]";
      } else {
        out[k] = scrubDeep(v, depth + 1);
      }
    }
    return out;
  }
  return value;
}

/* ── ضجيج لا يستحقّ تنبيهًا ─────────────────────────────────────────────── */

/**
 * أخطاء الشبكة العابرة داخل مطعمٍ ضعيف الواي‑فاي هي الحال الغالب لا العطل:
 * المستخدم يغيّر الصفحة فيُلغى الطلب، أو ينقطع الاتصال ثانيةً. تسجيلها يغرق
 * الحصّة الشهرية ويدفن الأعطال الحقيقية. أمّا فشل استعلامٍ فعليّ فيصل كخطأ
 * من الكود لا كانقطاع شبكة، فلا يُفلت من الشبكة.
 */
export const IGNORE_ERRORS = [
  "AbortError",
  "The operation was aborted",
  "Failed to fetch",
  "NetworkError when attempting to fetch resource",
  "Load failed",
  "ResizeObserver loop",
  // امتدادات المتصفّح تحقن أخطاءها في صفحتنا وليست منّا
  "chrome-extension://",
  "moz-extension://",
];

/* ── ما يُطبَّق على كل حدث قبل إرساله ───────────────────────────────────── */

type SentryEventLike = {
  message?: unknown;
  request?: { url?: string; query_string?: unknown; headers?: Record<string, string>; data?: unknown };
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  breadcrumbs?: { message?: string; data?: unknown }[];
  exception?: { values?: { value?: string }[] };
  user?: Record<string, unknown>;
};

/** المنقّي النهائي — يُمرَّر إلى beforeSend في كل بيئة. */
export function scrubEvent<T>(event: T): T {
  const e = event as SentryEventLike;

  if (typeof e.message === "string") e.message = scrub(e.message);

  if (e.exception?.values) {
    for (const v of e.exception.values) if (v.value) v.value = scrub(v.value);
  }

  if (e.request) {
    if (e.request.url) e.request.url = scrub(e.request.url);
    if (typeof e.request.query_string === "string") e.request.query_string = scrub(e.request.query_string);
    if (e.request.data !== undefined) e.request.data = scrubDeep(e.request.data);
    // الكوكيز والتصريح لا تُرسَل أصلًا (sendDefaultPii=false) — وهذا تأكيد
    if (e.request.headers) {
      delete e.request.headers.cookie;
      delete e.request.headers.authorization;
    }
  }

  if (e.extra) e.extra = scrubDeep(e.extra) as Record<string, unknown>;
  if (e.contexts) e.contexts = scrubDeep(e.contexts) as Record<string, unknown>;

  if (e.breadcrumbs) {
    for (const b of e.breadcrumbs) {
      if (typeof b.message === "string") b.message = scrub(b.message);
      if (b.data !== undefined) b.data = scrubDeep(b.data);
    }
  }

  // لا نُعرّف المستخدم بشخصه أبدًا — يكفي أنه «مستخدم ما» لحساب عدد المتأثّرين
  if (e.user) delete e.user.email;

  return event;
}
