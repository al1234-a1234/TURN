import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminCreateForm } from "./admin-create-form";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/admin");

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, slug, email, claim_code, claimed_at, is_active, created_at")
    .order("created_at", { ascending: false });

  const list = restaurants ?? [];
  const pending = list.filter((r) => r.claim_code);
  const claimed = list.filter((r) => !r.claim_code);

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-12 pt-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/dashboard" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <span className="text-lg font-extrabold">لوحة الأدمِن</span>
          <div className="h-11 w-11" />
        </div>
        <div className="mx-auto mt-6 max-w-3xl">
          <p className="text-sm text-cream-200/80">إدارة المنصّة</p>
          <h1 className="text-2xl font-extrabold">المطاعم</h1>
        </div>
      </header>

      <main className="mx-auto -mt-4 w-full max-w-3xl flex-1 space-y-8 px-5 pb-12">
        <section>
          <h2 className="mb-3 text-lg font-extrabold text-brand-800 dark:text-cream-100">
            إضافة مطعم جديد
          </h2>
          <AdminCreateForm />
        </section>

        {pending.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-extrabold text-brand-800 dark:text-cream-100">
              بانتظار الاستلام ({pending.length})
            </h2>
            <ul className="space-y-2">
              {pending.map((r) => (
                <li key={r.id} className="soft-card flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{r.name}</p>
                    <p className="truncate text-xs text-[color:var(--muted)]" dir="ltr">
                      /r/{r.slug}{r.email ? ` · ${r.email}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 select-all rounded-xl bg-brand-600 px-3 py-2 text-sm font-extrabold tracking-widest text-white" dir="ltr">
                    {r.claim_code}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-lg font-extrabold text-brand-800 dark:text-cream-100">
            المطاعم النشطة ({claimed.length})
          </h2>
          {claimed.length === 0 ? (
            <div className="soft-card p-6 text-center text-sm text-[color:var(--muted)]">
              لا توجد مطاعم مستلَمة بعد.
            </div>
          ) : (
            <ul className="space-y-2">
              {claimed.map((r) => (
                <li key={r.id} className="soft-card flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{r.name}</p>
                    <p className="truncate text-xs text-[color:var(--muted)]" dir="ltr">
                      /r/{r.slug}{r.email ? ` · ${r.email}` : ""}
                    </p>
                  </div>
                  <Link href={`/r/${r.slug}`} className="shrink-0 icon-btn" title="الصفحة العامة">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
