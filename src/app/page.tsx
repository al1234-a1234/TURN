import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand";

export const dynamic = "force-dynamic";

const HERO =
  "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?q=80&w=1400&auto=format&fit=crop";

export default async function Home() {
  const supabase = await createClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, name_en, slug, description, logo_url, cover_url, branches(id, city)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const list = (restaurants ?? []).filter((r) => (r.branches ?? []).length > 0);

  const withCounts = await Promise.all(
    list.map(async (r) => {
      const firstBranch = (r.branches ?? [])[0];
      let waiting = 0;
      if (firstBranch) {
        const { data } = await supabase.rpc("waitlist_counts", { b_id: firstBranch.id });
        const c = Array.isArray(data) ? data[0] : undefined;
        waiting = c?.total ?? 0;
      }
      return { ...r, waiting };
    }),
  );

  return (
    <div className="flex flex-1 flex-col">
      {/* ترويسة أنيقة بأجواء مطعم */}
      <header className="relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={HERO} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0c1712]/55 via-[#0c1712]/72 to-[#0c1712]" />

        <div className="relative z-10 mx-auto w-full max-w-2xl px-5 pb-10 pt-6">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrandMark size={44} />
              <span className="flex flex-col leading-none">
                <span className="font-serif text-xl font-bold tracking-[0.2em]" dir="ltr">TURN</span>
                <span className="text-xs font-bold text-[color:var(--gold-1)]/80">دور</span>
              </span>
            </div>
            <Link href="/login" className="icon-btn h-10 w-10" aria-label="دخول أصحاب المطاعم">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
                <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </Link>
          </nav>

          <div className="mt-8 text-center">
            <h1 className="font-serif text-4xl font-bold text-[color:var(--ink)]">خذ دورك بأناقة</h1>
            <p className="mt-2 text-sm text-[color:var(--muted)]">اختر مطعمك، وسجّل اسمك ورقمك، وتابع طابورك لحظة بلحظة.</p>
          </div>
        </div>
      </header>

      {/* المطاعم مباشرة */}
      <main className="mx-auto -mt-4 w-full max-w-2xl flex-1 space-y-4 px-5 pb-12">
        {withCounts.length === 0 ? (
          <div className="soft-card p-10 text-center text-[color:var(--muted)]">
            <span className="text-4xl">🍽️</span>
            <p className="mt-3 text-sm">لا توجد مطاعم متاحة بعد.</p>
          </div>
        ) : (
          withCounts.map((r, i) => {
            const branchCount = (r.branches ?? []).length;
            const city = (r.branches ?? [])[0]?.city;
            const initial = r.name.trim().charAt(0) || "م";
            return (
              <Link
                key={r.id}
                href={`/r/${r.slug}`}
                className="reveal soft-card group block overflow-hidden transition-all duration-[250ms] hover:-translate-y-0.5"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <div className="relative h-28 w-full bg-gradient-to-tr from-brand-700 to-brand-500">
                  {r.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover_url} alt="" className="h-full w-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[rgba(12,23,18,0.7)] to-transparent" />
                </div>
                <div className="flex items-center gap-4 px-4 pb-4">
                  <span className="-mt-8 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#0c1712] text-2xl font-extrabold text-[color:var(--gold-1)] shadow-[0_14px_30px_rgba(0,0,0,0.5)] ring-2 ring-[color:var(--gold-2)]">
                    {r.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initial
                    )}
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="truncate font-serif text-xl font-bold text-[color:var(--ink)]">{r.name}</p>
                    <p className="truncate text-sm text-[color:var(--muted)]">
                      {[city, `${branchCount} فرع`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${r.waiting > 0 ? "text-[color:var(--bg)]" : "chip"}`}
                    style={r.waiting > 0 ? { background: "linear-gradient(135deg,#e7d8b5,#c9a961)" } : undefined}
                  >
                    {r.waiting > 0 ? `${r.waiting} بالطابور` : "متاح الآن"}
                  </span>
                </div>
              </Link>
            );
          })
        )}
      </main>
    </div>
  );
}
