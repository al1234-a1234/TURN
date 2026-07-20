import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function RestaurantsPage() {
  const supabase = await createClient();

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, name_en, slug, description, branches(id, city)")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  const list = (restaurants ?? []).filter((r) => (r.branches ?? []).length > 0);

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

      <main className="mx-auto -mt-4 w-full max-w-2xl flex-1 space-y-3 px-5 pb-12">
        {list.length === 0 ? (
          <div className="soft-card p-10 text-center text-[color:var(--muted)]">
            <span className="text-4xl">🍽️</span>
            <p className="mt-3 text-sm">لا توجد مطاعم متاحة بعد.</p>
          </div>
        ) : (
          list.map((r) => {
            const branchCount = (r.branches ?? []).length;
            const city = (r.branches ?? [])[0]?.city;
            const initial = r.name.trim().charAt(0) || "م";
            return (
              <Link
                key={r.id}
                href={`/r/${r.slug}`}
                className="soft-card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]"
              >
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-brand-500 text-2xl font-extrabold text-white">
                  {initial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-extrabold text-brand-800 dark:text-cream-100">{r.name}</p>
                  <p className="text-sm text-[color:var(--muted)]">
                    {[city, `${branchCount} فرع`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="badge bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
                  انضمّ
                </span>
              </Link>
            );
          })
        )}
      </main>
    </div>
  );
}
