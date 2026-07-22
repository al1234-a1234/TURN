import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerShell } from "@/components/customer-shell";
import { toAr, waitMinutes } from "@/lib/format";

export const dynamic = "force-dynamic";

const RATING: Record<string, string> = { eficto: "٤٫٩", "bait-almounah": "٤٫٧", noo: "٤٫٦", rudy: "٤٫٨" };
const CUISINE: Record<string, string> = { eficto: "إيطالي", "bait-almounah": "شعبي", noo: "بحري", rudy: "بيتزا" };
const DIST: Record<string, string> = { eficto: "٣٫٣", "bait-almounah": "٥٫٢", noo: "٨٫٩", rudy: "٧٫١" };

export default async function Home() {
  const supabase = await createClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, slug, logo_url, cover_url, branches(id, city, branch_settings(accepts_waitlist))")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const list = (restaurants ?? []).filter((r) => (r.branches ?? []).length > 0);

  const withStatus = await Promise.all(
    list.map(async (r) => {
      const b = (r.branches ?? [])[0] as
        | { id: string; city: string | null; branch_settings: { accepts_waitlist: boolean } | { accepts_waitlist: boolean }[] | null }
        | undefined;
      let waiting = 0;
      if (b?.id) {
        const { data } = await supabase.rpc("waitlist_counts", { b_id: b.id });
        const c = Array.isArray(data) ? data[0] : undefined;
        waiting = c?.total ?? 0;
      }
      const settings = Array.isArray(b?.branch_settings) ? b?.branch_settings[0] : b?.branch_settings;
      const accepts = settings?.accepts_waitlist ?? true;
      return { ...r, city: b?.city ?? "", waiting, accepts };
    }),
  );

  return (
    <CustomerShell title="قائمة الانتظار" active="restaurants">
      {withStatus.length === 0 ? (
        <div className="rq-card p-10 text-center text-[color:var(--muted)]">
          <span className="text-4xl">🍽️</span>
          <p className="mt-3 text-sm">لا توجد مطاعم متاحة بعد.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {withStatus.map((r, i) => {
            const initial = r.name.trim().charAt(0) || "م";
            const eta = waitMinutes(r.waiting);
            return (
              <Link
                key={r.id}
                href={`/r/${r.slug}`}
                className="reveal rq-card block overflow-hidden p-4 transition active:scale-[0.985]"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-4">
                  {/* صورة/شعار المطعم */}
                  <span className="flex h-[104px] w-[104px] shrink-0 items-center justify-center overflow-hidden rounded-[20px] bg-brand-800 font-serif text-3xl font-bold text-cream-100">
                    {r.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initial
                    )}
                  </span>

                  {/* الاسم + المطبخ + المسافة */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-xl font-bold text-[color:var(--ink)]">{r.name}</p>
                    <p className="mt-0.5 truncate text-sm font-medium text-[color:var(--muted)]">
                      {CUISINE[r.slug] ?? "مطعم"}{r.city ? ` · ${r.city}` : ""}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[13px] font-bold text-[color:var(--muted)]">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-brand-600"><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="2" /></svg>
                      {DIST[r.slug] ?? "—"} كم
                    </p>
                  </div>

                  {/* التقييم */}
                  <span className="flex shrink-0 items-center gap-1 self-start text-[15px] font-extrabold text-[color:var(--ink)]">
                    <span style={{ color: "var(--star)" }}>★</span>
                    {RATING[r.slug] ?? "٤٫٧"}
                  </span>
                </div>

                {/* شريط الحالة — سبب وجود التطبيق */}
                <div className="mt-3 flex items-center justify-between rounded-2xl px-4 py-2.5" style={{ background: "var(--surface-2)" }}>
                  {!r.accepts ? (
                    <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--st-closed)" }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: "var(--st-closed)" }} />
                      لا يستقبل الآن
                    </span>
                  ) : r.waiting > 0 ? (
                    <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--st-full)" }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: "var(--st-full)" }} />
                      {toAr(r.waiting)} بالطابور · ~{toAr(eta)} دقيقة
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--st-open)" }}>
                      <span className="h-2 w-2 rounded-full" style={{ background: "var(--st-open)" }} />
                      متاح الآن · بدون انتظار
                    </span>
                  )}
                  <span className="text-xs font-bold text-brand-700">خذ دورك ←</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </CustomerShell>
  );
}
