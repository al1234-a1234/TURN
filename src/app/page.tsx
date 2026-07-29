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
    const b = (r.branches ?? [])[0];
    const c = b?.id ? counts.get(b.id) : undefined;
    const settings = Array.isArray(b?.branch_settings) ? b?.branch_settings[0] : b?.branch_settings;
    const accepts = settings?.accepts_waitlist ?? true;
    const closedNow = (settings?.manually_closed ?? false) || !isWithinOpeningHours(settings?.opening_hours ?? null);
    const busyNow = settings?.busy_now ?? false;
    const ra = ratingAgg.get(r.id);
    const rating = ra && ra.n > 0 ? (Math.round((ra.sum / ra.n) * 10) / 10).toFixed(1) : null;
    return {
      ...r,
      city: b?.city ?? "",
      lat: b?.lat ?? null,
      lng: b?.lng ?? null,
      waiting: c?.total ?? 0,
      inside: c?.inside ?? 0,
      outside: c?.outside ?? 0,
      accepts,
      closedNow,
      busyNow,
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
