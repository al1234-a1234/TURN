import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminCreateForm } from "./admin-create-form";
import { openRestaurantDashboard, setPlatformPause, adminToggleCanary } from "./actions";
import { DeleteRestaurantButton } from "./delete-restaurant-button";
import { LangToggle } from "@/components/lang-toggle";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/i18n-server";

export default async function AdminPage() {
  const lang = await getLang();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/partners?redirect=/admin");

  const { data: isAdmin } = await supabase.rpc("is_platform_admin");
  if (!isAdmin) redirect("/dashboard");

  // اسم دخول المالك وهاتفه لم يعودا مقروءَين من الجدول مباشرةً: كانا
  // مفتوحَين لكلّ مسجَّل، وسُحبا في 0092. والدالّة تفتحهما لمدير المنصّة وحده.
  const { data: restaurants } = await supabase.rpc("admin_restaurants_list");

  const { data: status } = await supabase
    .from("platform_status")
    .select("paused, reason, since")
    .maybeSingle();
  const paused = status?.paused === true;

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
          <span className="text-lg font-extrabold">{tr(lang, "لوحة الأدمِن", "Admin panel")}</span>
          <div className="flex items-center gap-2">
            <Link href="/account" className="icon-btn" title={tr(lang, "حسابي", "My account")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="8" cy="12" r="4" stroke="currentColor" strokeWidth="2" /><path d="M12 12h9M18 12v3M21 12v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            </Link>
            <LangToggle />
          </div>
        </div>
        <div className="mx-auto mt-6 max-w-3xl">
          <p className="text-sm tracking-widest text-[color:var(--gold-1)]/80">{tr(lang, "إدارة المنصّة", "Platform management")}</p>
          <h1 className="font-serif text-3xl font-bold text-[color:var(--ink)]">{tr(lang, "المطاعم", "Restaurants")}</h1>
        </div>
      </header>

      <main className="mx-auto -mt-4 w-full max-w-3xl flex-1 space-y-8 px-5 pb-12">
        {/* المقود أوّلًا: ساعة الطوارئ ليست ساعة تمرير الصفحة بحثًا عن زرّ */}
        <section>
          <h2 className="mb-3 font-serif text-xl font-bold text-[color:var(--ink)]">
            {tr(lang, "حالة المنصّة", "Platform status")}
          </h2>
          <div className="soft-card space-y-3 p-4">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: paused ? "var(--st-closed)" : "var(--st-open)" }}
                aria-hidden
              />
              <span className="font-bold text-[color:var(--ink)]">
                {paused
                  ? tr(lang, "موقوفة — لا انضمام ولا حجز جديد", "Paused — no new joins or bookings")
                  : tr(lang, "تعمل", "Running")}
              </span>
            </div>
            {paused && status?.reason ? (
              <p className="text-sm text-[color:var(--muted)]">{status.reason}</p>
            ) : null}
            <form action={setPlatformPause} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="paused" value={paused ? "0" : "1"} />
              {paused ? null : (
                <input
                  name="reason"
                  required
                  maxLength={200}
                  placeholder={tr(lang, "سبب الإيقاف (يُسجَّل ويُعرض)", "Reason (logged and shown)")}
                  className="field-input min-w-0 flex-1"
                />
              )}
              <button type="submit" className={`btn ${paused ? "btn-primary" : "btn-danger"} shrink-0`}>
                {paused ? tr(lang, "استئناف", "Resume") : tr(lang, "إيقاف المنصّة", "Pause platform")}
              </button>
            </form>
            <p className="text-xs text-[color:var(--muted)]">
              {tr(
                lang,
                "الإيقاف يمنع الانضمام والحجز الجديد فقط — ومن في الطابور يُجلَس ويُلغى كالمعتاد.",
                "Pausing blocks new joins and bookings only — guests already in line are still seated and can cancel.",
              )}
            </p>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-bold text-[color:var(--ink)]">{tr(lang, "إضافة مطعم + حساب مالك", "Add restaurant + owner account")}</h2>
            <Link href="/admin/bulk" className="shrink-0 rounded-full border border-[var(--hairline)] px-3 py-2 text-xs font-bold text-[color:var(--gold-1)]">
              {tr(lang, "بالجملة ←", "Bulk →")}
            </Link>
          </div>
          <AdminCreateForm />
        </section>

        <section>
          <h2 className="mb-3 font-serif text-xl font-bold text-[color:var(--ink)]">{tr(lang, "المطاعم", "Restaurants")} ({list.length})</h2>
          {list.length === 0 ? (
            <div className="soft-card p-6 text-center text-sm text-[color:var(--muted)]">{tr(lang, "لا توجد مطاعم بعد.", "No restaurants yet.")}</div>
          ) : (
            <ul className="space-y-2">
              {list.map((r) => (
                <li key={r.id} className="soft-card flex items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-[color:var(--ink)]">
                      {r.name}
                      {r.is_canary ? (
                        <span className="ms-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold" style={{ background: "rgba(201,169,97,0.16)", color: "var(--gold-1)" }}>
                          {tr(lang, "مخفيّ عن الجمهور", "Hidden from public")}
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-[color:var(--muted)]" dir="ltr">
                      /r/{r.slug}
                      {r.owner_username ? ` · 👤 ${r.owner_username}` : ""}
                      {r.owner_phone ? ` · ${r.owner_phone}` : ""}
                    </p>
                  </div>
                  <form action={openRestaurantDashboard} className="shrink-0">
                    <input type="hidden" name="restaurant_id" value={r.id} />
                    <button
                      type="submit"
                      className="rounded-full px-3 py-2 text-xs font-bold text-cream-100"
                      style={{ background: "var(--brand-solid)" }}
                    >
                      {tr(lang, "لوحة المطعم", "Dashboard")}
                    </button>
                  </form>
                  <Link
                    href={`/admin/${r.id}`}
                    className="shrink-0 rounded-full border border-[var(--hairline)] px-3 py-2 text-xs font-bold text-[color:var(--gold-1)]"
                  >
                    {tr(lang, "الباقة", "Plan")}
                  </Link>
                  <form action={adminToggleCanary} className="shrink-0">
                    <input type="hidden" name="restaurant_id" value={r.id} />
                    <input type="hidden" name="canary" value={r.is_canary ? "0" : "1"} />
                    <button
                      type="submit"
                      title={tr(lang, r.is_canary ? "أظهِر للجمهور" : "أخفِ عن الجمهور — يبقى قابلًا للاختبار برابطه", r.is_canary ? "Show to the public" : "Hide from the public — still testable via its link")}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] text-[color:var(--muted)] transition"
                    >
                      {r.is_canary ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                          <path d="M3 3l18 18M10.6 10.6a3 3 0 004.2 4.2M9.9 5.1A10.9 10.9 0 0112 5c6.5 0 10 7 10 7a13.2 13.2 0 01-3.1 3.9M6.5 6.6C3.9 8.3 2 12 2 12a13.4 13.4 0 004.2 4.9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </button>
                  </form>
                  <Link
                    href={`/r/${r.slug}`}
                    title={tr(lang, "الصفحة العامة", "Public page")}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] bg-[rgba(201,169,97,0.12)] text-[color:var(--gold-1)] transition"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                      <path d="M14 3h7v7M21 3l-9 9M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                  <DeleteRestaurantButton restaurantId={r.id} slug={r.slug} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
