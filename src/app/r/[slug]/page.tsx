import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BookingForm } from "./booking-form";

export default async function RestaurantPublicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id, name, name_en, description, logo_url, is_active")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!restaurant) {
    notFound();
  }

  const { data: branches } = await supabase
    .from("branches")
    .select("id, name, city, address, phone, timezone")
    .eq("restaurant_id", restaurant.id)
    .eq("is_active", true)
    .order("created_at");

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let defaultName = "";
  let defaultPhone = "";
  if (user) {
    const { data: customer } = await supabase
      .from("customers")
      .select("full_name, phone")
      .eq("user_id", user.id)
      .maybeSingle();
    defaultName = customer?.full_name ?? "";
    defaultPhone = customer?.phone ?? "";
  }

  const hasBranches = !!branches && branches.length > 0;
  const initial = restaurant.name.trim().charAt(0) || "م";

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-30 border-b border-[var(--border)]/70 bg-[var(--background)]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-brand-500 text-white shadow-[var(--shadow-lift)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            </span>
            <span className="text-lg font-extrabold text-brand-700 dark:text-brand-300">دور</span>
          </Link>
          <Link
            href={user ? "/dashboard" : `/login?redirect=/r/${slug}`}
            className="btn btn-ghost h-10 px-4"
          >
            {user ? "حسابي" : "تسجيل الدخول"}
          </Link>
        </div>
      </header>

      {/* هيرو المطعم */}
      <div className="bg-hero border-b border-[var(--border)]">
        <div className="mx-auto flex max-w-3xl items-center gap-5 px-5 py-10">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl bg-gradient-to-tr from-brand-600 to-brand-500 text-3xl font-extrabold text-white shadow-[var(--shadow-lift)]">
            {initial}
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-brand-900 dark:text-white">{restaurant.name}</h1>
            {restaurant.name_en && (
              <p className="mt-0.5 text-stone-400" dir="ltr">{restaurant.name_en}</p>
            )}
            {restaurant.description && (
              <p className="mt-2 max-w-prose text-[15px] leading-7 text-stone-600 dark:text-stone-300">
                {restaurant.description}
              </p>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h2 className="mb-5 text-xl font-extrabold text-brand-900 dark:text-white">احجز طاولتك</h2>

        {!hasBranches ? (
          <div className="card p-10 text-center text-stone-400">
            <span className="text-4xl">🏝️</span>
            <p className="mt-3 text-sm">لا توجد فروع متاحة للحجز حاليًا.</p>
          </div>
        ) : user ? (
          <BookingForm
            slug={slug}
            branches={branches!.map((b) => ({ id: b.id, name: b.name, timezone: b.timezone }))}
            defaultName={defaultName}
            defaultPhone={defaultPhone}
          />
        ) : (
          <div className="space-y-4">
            <ul className="grid gap-3 sm:grid-cols-2">
              {branches!.map((b) => (
                <li key={b.id} className="card p-5">
                  <p className="font-bold">{b.name}</p>
                  <p className="mt-1 text-sm text-stone-500">
                    {[b.city, b.address].filter(Boolean).join(" · ") || "بدون عنوان"}
                  </p>
                </li>
              ))}
            </ul>
            <div className="card flex flex-col items-center gap-4 bg-brand-700 p-8 text-center text-white dark:bg-brand-800">
              <p className="text-lg font-bold">سجّل الدخول لإتمام حجزك</p>
              <Link href={`/login?redirect=/r/${slug}`} className="btn btn-gold px-8">
                تسجيل الدخول / إنشاء حساب
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
