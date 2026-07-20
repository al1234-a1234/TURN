import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { WaitlistForm } from "./waitlist-form";

const ZONE_LABEL: Record<string, string> = {
  any: "أي مكان",
  inside: "الداخل",
  outside: "الخارج",
};

export default async function RestaurantPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, name_en, description, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!restaurant) notFound();

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, city, address")
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("created_at");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // عدّادات الطابور لكل فرع
  const branchList = branches ?? [];
  const withCounts = await Promise.all(
    branchList.map(async (b) => {
      const { data } = await supabase.rpc("waitlist_counts", { b_id: b.id });
      const c = Array.isArray(data) ? data[0] : undefined;
      return {
        id: b.id,
        name: b.name,
        total: c?.total ?? 0,
        inside: c?.inside ?? 0,
        outside: c?.outside ?? 0,
      };
    }),
  );

  // بيانات العميل + طلب انتظار نشط
  let defaultName = "";
  let defaultPhone = "";
  let activeEntry: { position: number | null; zone: string; party_size: number } | null = null;
  if (user) {
    const { data: customer } = await supabase
      .from("customers")
      .select("id, full_name, phone")
      .eq("user_id", user.id)
      .maybeSingle();
    defaultName = customer?.full_name ?? "";
    defaultPhone = customer?.phone ?? "";
    if (customer && branchList.length) {
      const { data: entry } = await supabase
        .from("waitlist_entries")
        .select("position, zone, party_size")
        .eq("customer_id", customer.id)
        .in("branch_id", branchList.map((b) => b.id))
        .in("status", ["waiting", "notified"])
        .order("joined_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      activeEntry = entry ?? null;
    }
  }

  const initial = restaurant.name.trim().charAt(0) || "م";
  const hasBranches = branchList.length > 0;

  return (
    <div className="flex flex-1 flex-col">
      <header className="app-header px-5 pb-8 pt-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/restaurants" className="icon-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
          <span className="font-extrabold">قائمة الانتظار</span>
          <div className="h-11 w-11" />
        </div>

        <div className="mx-auto mt-6 flex max-w-2xl items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl font-extrabold backdrop-blur">
            {initial}
          </div>
          <div>
            <h1 className="text-2xl font-extrabold">{restaurant.name}</h1>
            {restaurant.name_en && (
              <p className="text-sm text-cream-200/80" dir="ltr">{restaurant.name_en}</p>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto -mt-4 w-full max-w-2xl flex-1 px-5 pb-12">
        {restaurant.description && (
          <p className="mb-5 rounded-2xl bg-[var(--surface)] p-4 text-[15px] leading-7 text-[color:var(--muted)] shadow-[var(--shadow-soft)]">
            {restaurant.description}
          </p>
        )}

        {!hasBranches ? (
          <div className="soft-card p-10 text-center text-[color:var(--muted)]">
            <span className="text-4xl">🏝️</span>
            <p className="mt-3 text-sm">لا توجد فروع متاحة حاليًا.</p>
          </div>
        ) : activeEntry ? (
          <div className="soft-card flex flex-col items-center gap-3 p-8 text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-3xl font-extrabold text-white shadow-[var(--shadow-lift)]">
              #{activeEntry.position ?? "—"}
            </span>
            <p className="text-xl font-extrabold text-brand-800 dark:text-cream-100">أنت في قائمة الانتظار</p>
            <p className="text-sm text-[color:var(--muted)]">
              دورك رقم {activeEntry.position ?? "—"} · {activeEntry.party_size} أشخاص ·{" "}
              {ZONE_LABEL[activeEntry.zone] ?? activeEntry.zone}
            </p>
          </div>
        ) : user ? (
          <WaitlistForm
            slug={slug}
            branches={withCounts}
            defaultName={defaultName}
            defaultPhone={defaultPhone}
          />
        ) : (
          <div className="space-y-4">
            <div className="soft-card grid grid-cols-2 divide-x divide-x-reverse divide-[var(--border)] p-6 text-center">
              <div>
                <p className="text-sm text-[color:var(--muted)]">الداخل</p>
                <p className="mt-1 text-4xl font-extrabold text-brand-700 dark:text-brand-300">
                  {withCounts[0]?.inside ?? 0}
                </p>
              </div>
              <div>
                <p className="text-sm text-[color:var(--muted)]">الخارج</p>
                <p className="mt-1 text-4xl font-extrabold text-brand-700 dark:text-brand-300">
                  {withCounts[0]?.outside ?? 0}
                </p>
              </div>
            </div>
            <div className="soft-card flex flex-col items-center gap-4 bg-brand-700 p-8 text-center text-white">
              <p className="text-lg font-bold">سجّل الدخول للانضمام إلى الطابور</p>
              <Link href={`/login?redirect=/r/${slug}`} className="btn btn-cream px-8">
                تسجيل الدخول / إنشاء حساب
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
