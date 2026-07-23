import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getDiscovery } from "@/lib/supabase/public-cache";
import { CustomerShell } from "@/components/customer-shell";
import { toAr } from "@/lib/format";
import { getLang } from "@/lib/i18n-server";
import { tr, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";


function ZonePill({ label, count, lang }: { label: string; count: number; lang: Lang }) {
  const busy = count > 0;
  return (
    <span
      className="flex items-center justify-between rounded-2xl px-3.5 py-2.5"
      style={
        busy
          ? { background: "linear-gradient(155deg,#b23c1d,#661c0a)", boxShadow: "0 10px 20px -14px rgba(102,28,10,0.7)" }
          : { background: "linear-gradient(160deg,#faefe8,#f4ddd0)", border: "1px solid rgba(102,28,10,0.14)" }
      }
    >
      <span className="flex items-center gap-1.5 text-[13px] font-bold" style={{ color: busy ? "#fff" : "var(--brand-d)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: busy ? "#fff" : "var(--brand-d)" }}>
          <path d="M4 10h16M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3M7 14v4M17 14v4M4 14h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {label}
      </span>
      <span className="text-sm font-extrabold" style={{ color: busy ? "#fff" : "var(--brand-d)" }}>
        {busy ? tr(lang, `${toAr(count)} بالطابور`, `${toAr(count)} in queue`) : tr(lang, "متاح", "Available")}
      </span>
    </span>
  );
}

export default async function Home() {
  const lang = await getLang();
  const supabase = await createClient();

  // قائمة الاكتشاف + التقييمات مكاشة (٣٠ث) — لا تضرب القاعدة في كل زيارة
  const { list, ratings } = await getDiscovery();
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
        <div className="space-y-2.5">
          {withStatus.map((r, i) => {
            const initial = (r.name ?? "").trim().charAt(0) || "م";
            return (
              <Link
                key={r.id}
                href={`/r/${r.slug}`}
                className="reveal rq-card block overflow-hidden p-3 transition active:scale-[0.985]"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <div className="flex items-center gap-3">
                  {/* صورة/شعار المطعم */}
                  <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-brand-800 font-serif text-2xl font-bold text-cream-100">
                    {r.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initial
                    )}
                  </span>

                  {/* الاسم + المطبخ + المدينة */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[17px] font-bold text-[color:var(--ink)]">{r.name}</p>
                    <p className="mt-0.5 truncate text-[13px] font-medium text-[color:var(--muted)]">
                      {tr(lang, r.cuisine ?? "مطعم", r.cuisine_en ?? "Restaurant")}{r.city ? ` · ${r.city}` : ""}
                    </p>
                  </div>

                  {/* التقييم */}
                  {r.rating && (
                    <span className="flex shrink-0 items-center gap-1 self-start text-[15px] font-extrabold text-[color:var(--ink)]">
                      <span style={{ color: "var(--star)" }}>★</span>
                      {r.rating}
                    </span>
                  )}
                </div>

                {/* شريط الحالة — طابور داخلي/خارجي */}
                {!r.accepts ? (
                  <div
                    className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                    style={{ background: "linear-gradient(160deg,#eee7dc,#e2d8c9)", border: "1px solid rgba(45,25,15,0.10)" }}
                  >
                    <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: "#8a8377" }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#b3a996" }} />
                      {tr(lang, "لا يستقبل الآن", "Not accepting now")}
                    </span>
                    <span className="text-xs font-extrabold" style={{ color: "#a89d8a" }}>{tr(lang, "التفاصيل ←", "Details ←")}</span>
                  </div>
                ) : r.waiting > 0 && r.inside + r.outside > 0 ? (
                  <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <ZonePill label={tr(lang, "داخلي", "Indoor")} count={r.inside} lang={lang} />
                    <ZonePill label={tr(lang, "خارجي", "Outdoor")} count={r.outside} lang={lang} />
                  </div>
                ) : r.waiting > 0 ? (
                  <div
                    className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                    style={{ background: "linear-gradient(150deg,#b23c1d,#661c0a)", boxShadow: "0 12px 24px -16px rgba(102,28,10,0.72)" }}
                  >
                    <span className="flex items-center gap-2 text-sm font-extrabold text-white">
                      <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
                      {tr(lang, `${toAr(r.waiting)} بالطابور الآن`, `${toAr(r.waiting)} in queue now`)}
                    </span>
                    <span className="text-xs font-extrabold text-white/85">{tr(lang, "التفاصيل ←", "Details ←")}</span>
                  </div>
                ) : (
                  <div
                    className="mt-2.5 flex items-center justify-between rounded-2xl px-3.5 py-2.5"
                    style={{ background: "linear-gradient(160deg,#fbf1ea,#f4ddd0)", border: "1px solid rgba(102,28,10,0.16)" }}
                  >
                    <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: "var(--brand-d)" }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--brand-d)", boxShadow: "0 0 0 3px rgba(102,28,10,0.14)" }} />
                      {tr(lang, "متاح الآن · بدون انتظار", "Available now · No wait")}
                    </span>
                    <span className="text-xs font-extrabold" style={{ color: "var(--brand-d)" }}>{tr(lang, "خذ دورك ←", "Take your turn ←")}</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </CustomerShell>
  );
}
