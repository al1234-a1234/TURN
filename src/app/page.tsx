import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand";

export const dynamic = "force-dynamic";

const AR = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
const toAr = (s: string | number) =>
  String(s).replace(/[0-9]/g, (d) => AR[+d]);

// تقييمات تجريبية للعرض
const RATING: Record<string, string> = {
  eficto: "٤٫٩",
  "bait-almounah": "٤٫٧",
  noo: "٤٫٦",
  rudy: "٤٫٨",
};

export default async function Home() {
  const supabase = await createClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, slug, description, logo_url, cover_url, branches(id, city)")
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
    <div className="flex flex-1 flex-col bg-[color:var(--background)]">
      {/* هيدر أخضر */}
      <header className="app-header px-5 pb-6 pt-5">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandMark size={40} />
            <span className="flex flex-col leading-none">
              <span className="font-serif text-xl font-bold tracking-[0.14em]" dir="ltr">TURN</span>
              <span className="mt-0.5 text-xs font-bold text-cream-200/85">دور</span>
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-sm font-bold text-white/90">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
            </svg>
            الرياض
          </span>
        </div>
        <div className="mx-auto mt-4 flex max-w-2xl items-center gap-2.5 rounded-2xl bg-white/96 px-4 py-3 text-sm text-[color:var(--muted)]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden className="text-brand-600">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          ابحث عن مطعم أو نوع مطبخ…
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-14 pt-5">
        <div className="mb-4 flex items-center justify-between px-1">
          <h2 className="font-display text-xl font-bold text-[color:var(--ink)]">الأقرب إليك</h2>
          <span className="text-xs font-bold text-[color:var(--muted)]">{toAr(withCounts.length)} مطاعم</span>
        </div>

        {withCounts.length === 0 ? (
          <div className="soft-card p-10 text-center text-[color:var(--muted)]">
            <span className="text-4xl">🍽️</span>
            <p className="mt-3 text-sm">لا توجد مطاعم متاحة بعد.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {withCounts.map((r, i) => {
              const city = (r.branches ?? [])[0]?.city;
              const initial = r.name.trim().charAt(0) || "م";
              const busy = r.waiting > 0;
              return (
                <Link
                  key={r.id}
                  href={`/r/${r.slug}`}
                  className="reveal soft-card block overflow-hidden transition active:scale-[0.985]"
                  style={{ animationDelay: `${i * 70}ms` }}
                >
                  <div className="relative h-[130px] w-full bg-brand-100">
                    {r.cover_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.cover_url} alt="" className="h-full w-full object-cover" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-brand-900/55 to-transparent" />
                    <span
                      className={`absolute right-3 top-3 rounded-full px-3 py-1.5 text-xs font-bold ${
                        busy ? "bg-cream-100 text-brand-800" : "bg-black/35 text-white backdrop-blur"
                      }`}
                    >
                      {busy ? `${toAr(r.waiting)} بالطابور` : "متاح الآن"}
                    </span>
                  </div>
                  <div className="relative -mt-6 flex items-start gap-3 px-4 pb-4">
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-[3px] border-white bg-brand-800 font-serif text-xl font-bold text-cream-100 shadow-md">
                      {r.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.logo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initial
                      )}
                    </span>
                    <div className="min-w-0 flex-1 pt-7">
                      <p className="truncate font-display text-lg font-bold text-[color:var(--ink)]">{r.name}</p>
                      <p className="truncate text-[13px] font-medium text-[color:var(--muted)]">
                        {[city, "مطعم"].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="pt-7 text-left">
                      <p className="text-sm font-extrabold text-brand-600">★ {RATING[r.slug] ?? "٤٫٧"}</p>
                      <p className="mt-0.5 text-[11px] font-medium text-[color:var(--muted)]">١ فرع</p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
