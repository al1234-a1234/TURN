import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminCreateForm } from "./admin-create-form";

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/partners?redirect=/admin");

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  const { data: restaurants } = await supabase
    .from("restaurants")
    .select("id, name, slug, owner_username, owner_phone, is_active, created_at")
    .order("created_at", { ascending: false });

  const list = restaurants ?? [];

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
          <p className="text-sm tracking-widest text-[color:var(--gold-1)]/80">إدارة المنصّة</p>
          <h1 className="font-serif text-3xl font-bold text-[color:var(--ink)]">المطاعم</h1>
        </div>
      </header>

      <main className="mx-auto -mt-4 w-full max-w-3xl flex-1 space-y-8 px-5 pb-12">
        <section>
          <h2 className="mb-3 font-serif text-xl font-bold text-[color:var(--ink)]">إضافة مطعم + حساب مالك</h2>
          <AdminCreateForm />
        </section>

        <section>
          <h2 className="mb-3 font-serif text-xl font-bold text-[color:var(--ink)]">المطاعم ({list.length})</h2>
          {list.length === 0 ? (
            <div className="soft-card p-6 text-center text-sm text-[color:var(--muted)]">لا توجد مطاعم بعد.</div>
          ) : (
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id} className="soft-card flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-[color:var(--ink)]">{r.name}</p>
                    <p className="truncate text-xs text-[color:var(--muted)]" dir="ltr">
                      /r/{r.slug}
                      {r.owner_username ? ` · 👤 ${r.owner_username}` : ""}
                      {r.owner_phone ? ` · ${r.owner_phone}` : ""}
                    </p>
                  </div>
                  <Link
                    href={`/admin/${r.id}`}
                    className="shrink-0 rounded-full px-3 py-2 text-xs font-bold text-white"
                    style={{ background: "linear-gradient(160deg,#a8371a,#661c0a)" }}
                  >
                    الباقة
                  </Link>
                  <Link
                    href={`/r/${r.slug}`}
                    title="الصفحة العامة"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] bg-[rgba(201,169,97,0.12)] text-[color:var(--gold-1)] transition"
                  >
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
