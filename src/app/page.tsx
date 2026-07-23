import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CustomerShell } from "@/components/customer-shell";
import { toAr } from "@/lib/format";
import { getLang } from "@/lib/i18n-server";
import { tr, type Lang } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const RATING: Record<string, string> = { eficto: "4.9", "bait-almounah": "4.7", noo: "4.6", rudy: "4.8" };
const CUISINE: Record<string, string> = { eficto: "إيطالي", "bait-almounah": "شعبي", noo: "بحري", rudy: "بيتزا" };
const CUISINE_EN: Record<string, string> = { eficto: "Italian", "bait-almounah": "Local", noo: "Seafood", rudy: "Pizza" };
const DIST: Record<string, string> = { eficto: "3.3", "bait-almounah": "5.2", noo: "8.9", rudy: "7.1" };

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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: busy ? "#fff" : "var(--st-open)" }}>
          <path d="M4 10h16M6 10V7a2 2 0 012-2h8a2 2 0 012 2v3M7 14v4M17 14v4M4 14h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {label}
      </span>
      <span className="text-sm font-extrabold" style={{ color: busy ? "#fff" : "var(--st-open)" }}>
        {busy ? tr(lang, `${toAr(count)} بالطابور`, `${toAr(count)} in queue`) : tr(lang, "متاح", "Available")}
      </span>
    </span>
  );
}

export default async function Home() {
  const lang = await getLang();
  const supabase = await createClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, slug, logo_url, cover_url, branches(id, city, branch_settings(accepts_waitlist))")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const list = (restaurants ?? []).filter((r) => (r.branches ?? []).length > 0);

  // استعلام واحد لعدّادات كل الفروع النشطة (بدل استعلام لكل مطعم — يمنع N+1)
  const { data: countsData } = await supabase.rpc("active_waitlist_counts");
  const counts = new Map(
    (countsData ?? []).map((c) => [c.branch_id, { total: c.total, inside: c.inside, outside: c.outside }]),
  );

  const withStatus = list.map((r) => {
    const b = (r.branches ?? [])[0] as
      | { id: string; city: string | null; branch_settings: { accepts_waitlist: boolean } | { accepts_waitlist: boolean }[] | null }
      | undefined;
    const c = b?.id ? counts.get(b.id) : undefined;
    const settings = Array.isArray(b?.branch_settings) ? b?.branch_settings[0] : b?.branch_settings;
    const accepts = settings?.accepts_waitlist ?? true;
    return {
      ...r,
      city: b?.city ?? "",
      waiting: c?.total ?? 0,
      inside: c?.inside ?? 0,
      outside: c?.outside ?? 0,
      accepts,
    };
  });

  return (
    <CustomerShell title={tr(lang, "قائمة الانتظار", "Waitlist")} active="restaurants">
      {withStatus.length === 0 ? (
        <div className="rq-card p-10 text-center text-[color:var(--muted)]">
          <span className="text-4xl">🍽️</span>
          <p className="mt-3 text-sm">{tr(lang, "لا توجد مطاعم متاحة بعد.", "No restaurants available yet.")}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {withStatus.map((r, i) => {
            const initial = r.name.trim().charAt(0) || "م";
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
                      {tr(lang, CUISINE[r.slug] ?? "مطعم", CUISINE_EN[r.slug] ?? "Restaurant")}{r.city ? ` · ${r.city}` : ""}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-[13px] font-bold text-[color:var(--muted)]">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="text-brand-600"><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="10" r="2.4" stroke="currentColor" strokeWidth="2" /></svg>
                      {DIST[r.slug] ?? "—"} {tr(lang, "كم", "km")}
                    </p>
                  </div>

                  {/* التقييم */}
                  <span className="flex shrink-0 items-center gap-1 self-start text-[15px] font-extrabold text-[color:var(--ink)]">
                    <span style={{ color: "var(--star)" }}>★</span>
                    {RATING[r.slug] ?? "4.7"}
                  </span>
                </div>

                {/* شريط الحالة — طابور داخلي/خارجي */}
                {!r.accepts ? (
                  <div
                    className="mt-3 flex items-center justify-between rounded-2xl px-4 py-3"
                    style={{ background: "linear-gradient(150deg,#661c0a,#2f0d05)", boxShadow: "0 12px 24px -16px rgba(47,13,5,0.7)" }}
                  >
                    <span className="flex items-center gap-2 text-sm font-extrabold" style={{ color: "#f3e4dc" }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#f0a892" }} />
                      {tr(lang, "لا يستقبل الآن", "Not accepting now")}
                    </span>
                    <span className="text-xs font-extrabold" style={{ color: "rgba(243,228,220,0.8)" }}>{tr(lang, "التفاصيل ←", "Details ←")}</span>
                  </div>
                ) : r.waiting > 0 ? (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <ZonePill label={tr(lang, "داخلي", "Indoor")} count={r.inside} lang={lang} />
                    <ZonePill label={tr(lang, "خارجي", "Outdoor")} count={r.outside} lang={lang} />
                  </div>
                ) : (
                  <div
                    className="mt-3 flex items-center justify-between rounded-2xl px-4 py-3"
                    style={{ background: "linear-gradient(150deg,#b23c1d,#661c0a)", boxShadow: "0 12px 24px -14px rgba(102,28,10,0.75)" }}
                  >
                    <span className="flex items-center gap-2 text-sm font-extrabold text-white">
                      <span className="h-2.5 w-2.5 rounded-full bg-white/90" style={{ boxShadow: "0 0 0 3px rgba(255,255,255,0.25)" }} />
                      {tr(lang, "متاح الآن · بدون انتظار", "Available now · No wait")}
                    </span>
                    <span className="text-xs font-extrabold text-white">{tr(lang, "خذ دورك ←", "Take your turn ←")}</span>
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
