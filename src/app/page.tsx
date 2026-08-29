import { getDiscovery, getHomeQueueCounts, getHomeZoneCounts, getHomeZoneNames } from "@/lib/supabase/public-cache";
import { CustomerShell } from "@/components/customer-shell";
import { AutoRefresh } from "@/components/auto-refresh";
import { DiscoveryList } from "./discovery-list";
import { isWithinOpeningHours } from "@/lib/dates";

// تُخزَّن على الحافة ٣٠ ثانية فتصل للزائر جاهزةً بدل توليدٍ كامل لكل طلب.
// المدّة نفسها التي تُكاش بها بيانات الاكتشاف، فلا تسبق الصفحةُ بياناتها.
// وأرقام الطابور الحيّة ليست هنا: التذكرة وصفحة المطعم والاستقبال بلا كاش.
export const revalidate = 30;

export default async function Home() {
  // قائمة الاكتشاف + التقييمات — مكاشة (٣٠ث) لا تضرب القاعدة في كل زيارة.
  //
  // دوال الكاش ترمي عند فشل الاستعلام عمدًا (كي لا تُخزَّن نتيجةٌ فارغة كاذبة
  // فتُقدَّم للجميع)، لكن هذه الصفحة تُولَّد مسبقًا وقت البناء — ورميٌ غير
  // ملتقَط هنا يعني أن **انقطاعًا لحظيًّا للقاعدة يُفشل النشر كلّه**. نلتقطه
  // هنا فيبقى الكاش نظيفًا ويبقى النشر مستقلًّا عن توفّر القاعدة لحظةَ البناء.
  let list: Awaited<ReturnType<typeof getDiscovery>>["list"] = [];
  let ratings: Awaited<ReturnType<typeof getDiscovery>>["ratings"] = {};
  let countsData: Awaited<ReturnType<typeof getHomeQueueCounts>> = [];
  try {
    ({ list, ratings } = await getDiscovery());
    // عدّادات الطوابير: كاش قصير (١٠ث) — الرئيسية أعلى الصفحات زيارةً، وبدونه
    // كل زيارة تضرب القاعدة باستدعاء حيّ. ١٠ثوانٍ تقادمٍ مقبولة لعدّادٍ استكشافي؛
    // الأرقام الدقيقة لحظيًّا تبقى في صفحة المطعم والتذكرة.
    countsData = await getHomeQueueCounts(list.flatMap((r) => r.branches.map((b) => b.id)));
  } catch (err) {
    // القائمة تبقى فارغة لهذا التوليد فقط؛ الطلب التالي يعيد المحاولة لأن
    // الفشل لم يدخل الكاش. والسجلّ يظهر في Vercel بدل اختفاء العطل بصمت.
    console.error("[home] discovery unavailable:", err instanceof Error ? err.message : err);
  }
  // توزيع الأقسام — يُعرض لمطعم الفرع الواحد وحده (انظر أسفل). نجلبه لكل
  // الفروع في نداءٍ واحد بدل نداءٍ لكل مطعم.
  const allBranchIds = list.flatMap((r) => r.branches.map((b) => b.id));
  let zoneRows: { branch_id: string; zone_key: string; waiting: number }[] = [];
  let zoneNameRows: { branch_id: string; key: string; name: string; sort_order: number }[] = [];
  try {
    if (allBranchIds.length) {
      const [zc, zn] = await Promise.all([
        getHomeZoneCounts(allBranchIds),
        getHomeZoneNames(allBranchIds),
      ]);
      zoneRows = zc;
      zoneNameRows = zn;
    }
  } catch (err) {
    // توزيعٌ غائب لا يُفرغ القائمة — البطاقة تسقط إلى الإجمالي
    console.error("[home] zone counts unavailable:", err instanceof Error ? err.message : err);
  }
  const zoneCountOf = new Map<string, number>();
  for (const z of zoneRows) zoneCountOf.set(`${z.branch_id}:${z.zone_key}`, Number(z.waiting));

  const ratingAgg = new Map(Object.entries(ratings));
  const counts = new Map(
    (countsData ?? []).map((c) => [c.branch_id, { total: c.total }]),
  );

  const withStatus = list.map((r) => {
    // مطعم متعدد الفروع: البطاقة كانت تمثّل أول فرع فقط — فرعٌ فيه طابور
    // وفرعٌ آخر فاضي كانت تعرضه «فيه طابور» والعميل ينصدّ وهو يقدر يدخل
    // الفرع الفاضي على طول. القاعدة الآن: أي فرع مفتوح متاح ← المطعم متاح؛
    // وإلا نعرض أقصر طابور بين الفروع المفتوحة؛ ومغلق فقط إذا أغلقت كلها.
    const decorated = (r.branches ?? []).map((b) => {
      const s = Array.isArray(b.branch_settings) ? b.branch_settings[0] : b.branch_settings;
      const c = counts.get(b.id);
      return {
        b,
        total: c?.total ?? 0,
        accepts: s?.accepts_waitlist ?? true,
        paused: s?.queue_paused ?? false,
        closed: (s?.manually_closed ?? false) || !isWithinOpeningHours(s?.opening_hours ?? null),
      };
    });
    const open = decorated.filter((d) => !d.closed);
    // «متاح» = طابوره صفر، أو لا يستخدم نظام الطابور أصلًا (استقبال مباشر)
    const free = open.find((d) => d.total === 0 || !d.accepts);
    const shortest = open.length
      ? open.reduce((min, d) => (d.total < min.total ? d : min), open[0])
      : null;
    const best = free ?? shortest ?? decorated[0];
    const ra = ratingAgg.get(r.id);
    // تقييم المالك اليدوي (0122) يتقدّم على متوسط تقييمات المنصّة الداخلية
    // القليلة — قراره وذمّته، إلى أن تُربط مزامنة قوقل ماب بمفتاح API.
    const rating =
      r.manual_rating != null
        ? Number(r.manual_rating).toFixed(1)
        : ra && ra.n > 0
          ? (Math.round((ra.sum / ra.n) * 10) / 10).toFixed(1)
          : null;
    // البطاقة لا تعرض المدينة ولا المسافة ولا «مزدحم الآن»، فلا نرسلها:
    // كل حقلٍ هنا يُسلسَل في حمولة الصفحة لكل مطعمٍ في القائمة.
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      logo_url: r.logo_url,
      cuisine: r.cuisine,
      cuisine_en: r.cuisine_en,
      // فرعٌ موقوفٌ طابورُه: صفرٌ دائمًا مهما بقي فيه من واقفين.
      // بلا هذا تقول البطاقة «فيه طابور ٣» ويدخل العميل فيجد «لا يوجد
      // انتظار» — تناقضٌ بين شاشتين، وهو أسوأ من أيّ الرقمين وحده.
      waiting: best?.paused ? 0 : (best?.total ?? 0),
      accepts: best?.accepts ?? true,
      closedNow: open.length === 0,
      rating,
      branchCount: (r.branches ?? []).length,
      // توزيع الأقسام لمطعم الفرع الواحد فقط.
      //
      // متعدّد الفروع لا رقم له من الخارج: البطاقة كانت تعرض رقم «أقصر
      // طابور» فيقرؤه العميل رقمَ المطعم كلّه — ويجد داخلًا رقمًا آخر.
      // فرعان بطابورين مختلفين لا يختصرهما رقمٌ واحد بلا كذب.
      zones:
        (r.branches ?? []).length === 1 && best
          ? (zoneNameRows
              .filter((z) => z.branch_id === best.b.id)
              .sort((a, b2) => (a.sort_order ?? 0) - (b2.sort_order ?? 0))
              .map((z) => ({
                name: z.name,
                waiting: zoneCountOf.get(`${z.branch_id}:${z.key}`) ?? 0,
              }))
              .filter((z) => z.waiting > 0))
          : [],
    };
  });

  return (
    <CustomerShell active="restaurants">
      {/* أرقام الطابور تتحرّك والصفحة واقفة — خصوصًا رجوع سفاري من
          ذاكرة الصفحات الذي يعيدها بحالتها القديمة بلا أي طلب */}
      <AutoRefresh />
      <DiscoveryList items={withStatus} />
    </CustomerShell>
  );
}
