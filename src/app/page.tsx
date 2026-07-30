import { getDiscovery, getHomeQueueCounts } from "@/lib/supabase/public-cache";
import { CustomerShell } from "@/components/customer-shell";
import { DiscoveryList } from "./discovery-list";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";
import { isWithinOpeningHours } from "@/lib/dates";

export const dynamic = "force-dynamic";

export default async function Home() {
  const lang = await getLang();

  // قائمة الاكتشاف + التقييمات + العروض الحيّة — مكاشة (٣٠ث) لا تضرب القاعدة في كل زيارة
  const { list, ratings, offers } = await getDiscovery();
  const ratingAgg = new Map(Object.entries(ratings));

  // عدّادات الطوابير: كاش قصير (١٠ث) — الرئيسية أعلى الصفحات زيارةً، وبدونه
  // كل زيارة تضرب القاعدة باستدعاء حيّ. ١٠ثوانٍ تقادمٍ مقبولة لعدّادٍ استكشافي؛
  // الأرقام الدقيقة لحظيًّا تبقى في صفحة المطعم والتذكرة.
  const pageBranchIds = list.flatMap((r) => r.branches.map((b) => b.id));
  const countsData = await getHomeQueueCounts(pageBranchIds);
  const counts = new Map(
    (countsData ?? []).map((c) => [c.branch_id, { total: c.total, inside: c.inside, outside: c.outside }]),
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
        inside: c?.inside ?? 0,
        outside: c?.outside ?? 0,
        accepts: s?.accepts_waitlist ?? true,
        busy: s?.busy_now ?? false,
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
    const rating = ra && ra.n > 0 ? (Math.round((ra.sum / ra.n) * 10) / 10).toFixed(1) : null;
    return {
      ...r,
      city: best?.b.city ?? "",
      lat: best?.b.lat ?? null,
      lng: best?.b.lng ?? null,
      waiting: best?.total ?? 0,
      inside: best?.inside ?? 0,
      outside: best?.outside ?? 0,
      accepts: best?.accepts ?? true,
      closedNow: open.length === 0,
      busyNow: best?.busy ?? false,
      rating,
      branchCount: (r.branches ?? []).length,
    };
  });

  return (
    <CustomerShell active="restaurants">
      {withStatus.length === 0 ? (
        <div className="rq-card p-10 text-center text-[color:var(--muted)]">
          <span className="text-4xl">🍽️</span>
          <p className="mt-3 text-sm">{tr(lang, "لا توجد مطاعم متاحة بعد.", "No restaurants available yet.")}</p>
        </div>
      ) : (
        <DiscoveryList items={withStatus} offers={offers} lang={lang} />
      )}
    </CustomerShell>
  );
}
