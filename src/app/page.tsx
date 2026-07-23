import { createClient } from "@/lib/supabase/server";
import { getDiscovery } from "@/lib/supabase/public-cache";
import { CustomerShell } from "@/components/customer-shell";
import { DiscoveryList } from "./discovery-list";
import { getLang } from "@/lib/i18n-server";
import { tr } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function Home() {
  const lang = await getLang();
  const supabase = await createClient();

  // قائمة الاكتشاف + التقييمات + العروض الحيّة — مكاشة (٣٠ث) لا تضرب القاعدة في كل زيارة
  const { list, ratings, offers } = await getDiscovery();
  const ratingAgg = new Map(Object.entries(ratings));

  // عدّاد الطوابير حيّ (خارج الكاش) ومحصور بفروع الصفحة فقط
  const pageBranchIds = list.flatMap((r) => r.branches.map((b) => b.id));
  const { data: countsData } = pageBranchIds.length
    ? await supabase.rpc("waitlist_counts_for", { p_branch_ids: pageBranchIds })
    : { data: [] as { branch_id: string; total: number; inside: number; outside: number }[] };
  const counts = new Map(
    (countsData ?? []).map((c) => [c.branch_id, { total: c.total, inside: c.inside, outside: c.outside }]),
  );

  const withStatus = list.map((r) => {
    const b = (r.branches ?? [])[0] as
      | { id: string; city: string | null; is_active: boolean; branch_settings: { accepts_waitlist: boolean } | { accepts_waitlist: boolean }[] | null }
      | undefined;
    const c = b?.id ? counts.get(b.id) : undefined;
    const settings = Array.isArray(b?.branch_settings) ? b?.branch_settings[0] : b?.branch_settings;
    const accepts = settings?.accepts_waitlist ?? true;
    const ra = ratingAgg.get(r.id);
    const rating = ra && ra.n > 0 ? (Math.round((ra.sum / ra.n) * 10) / 10).toFixed(1) : null;
    return {
      ...r,
      city: b?.city ?? "",
      waiting: c?.total ?? 0,
      inside: c?.inside ?? 0,
      outside: c?.outside ?? 0,
      accepts,
      rating,
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
