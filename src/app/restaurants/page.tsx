import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RestaurantsPage() {
  const supabase = await createClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, name_en, slug, description, logo_url, cover_url, branches(id, city)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const list = (restaurants ?? []).filter((r) => (r.branches ?? []).length > 0);

  // العدّاد الحيّ لطابور أول فرع لكل مطعم
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
      <header className="app-header px-5 pb-8 pt-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <span className="text-lg font-extrabold">المطاعم</span>
          <Link href="/dashboard" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
        <p className="mx-auto mt-4 max-w-2xl text-cream-200/90">
          اختر مطعمك وانضم إلى قائمة الانتظار مباشرةً.
        </p>
      </header>

      <main className="mx-auto -mt-4 w-full max-w-2xl flex-1 space-y-4 px-5 pb-12">
        {withCounts.length === 0 ? (
          <div className="soft-card p-10 text-center text-[color:var(--muted)]">
            <span className="text-4xl">🍽️</span>
            <p className="mt-3 text-sm">لا توجد مطاعم متاحة بعد.</p>
          </div>
        ) : (
          withCounts.map((r) => {
            const branchCount = (r.branches ?? []).length;
            const city = (r.branches ?? [])[0]?.city;
            const initial = r.name.trim().charAt(0) || "م";
            return (
              <Link
                key={r.id}
                href={`/r/${r.slug}`}
                className="soft-card group block overflow-hidden transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
              >
                {/* شريط الغلاف */}
                <div className="h-24 w-full bg-gradient-to-tr from-brand-600 to-brand-500">
                  {r.cover_url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.cover_url} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="flex items-center gap-4 px-4 pb-4">
                  {/* الشعار */}
                  <span className="-mt-8 flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-4 border-[var(--surface)] bg-gradient-to-tr from-brand-600 to-brand-500 text-2xl font-extrabold text-white shadow-[var(--shadow-lift)]">
                    {r.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      initial
                    )}
                  </span>
                  <div className="min-w-0 flex-1 pt-1">
                    <p className="truncate text-lg font-extrabold text-brand-800 dark:text-cream-100">
                      {r.name}
                    </p>
                    <p className="truncate text-sm text-[color:var(--muted)]">
                      {[city, `${branchCount} فرع`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  {/* عدّاد الطابور الحيّ */}
                  <span
                    className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-bold ${
                      r.waiting > 0
                        ? "bg-brand-600 text-white"
                        : "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                    }`}
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
