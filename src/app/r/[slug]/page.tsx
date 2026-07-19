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

  // بيانات العميل لتعبئة النموذج مسبقًا
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

  return (
    <div className="flex flex-1 flex-col bg-zinc-50 dark:bg-black">
      <header className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="text-xl font-extrabold text-teal-700 dark:text-teal-400"
          >
            دور
          </Link>
          <Link
            href={user ? "/dashboard" : `/login?redirect=/r/${slug}`}
            className="text-sm font-medium text-teal-600 hover:underline"
          >
            {user ? "حسابي" : "تسجيل الدخول"}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold">{restaurant.name}</h1>
          {restaurant.name_en && (
            <p className="mt-1 text-zinc-400" dir="ltr">
              {restaurant.name_en}
            </p>
          )}
          {restaurant.description && (
            <p className="mt-3 max-w-prose leading-8 text-zinc-600 dark:text-zinc-300">
              {restaurant.description}
            </p>
          )}
        </div>

        <h2 className="mb-4 text-lg font-semibold">احجز طاولتك</h2>

        {!hasBranches ? (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-400 dark:border-zinc-700">
            لا توجد فروع متاحة للحجز حاليًا.
          </p>
        ) : user ? (
          <BookingForm
            slug={slug}
            branches={branches!.map((b) => ({
              id: b.id,
              name: b.name,
              timezone: b.timezone,
            }))}
            defaultName={defaultName}
            defaultPhone={defaultPhone}
          />
        ) : (
          <div className="space-y-4">
            <ul className="space-y-3">
              {branches!.map((b) => (
                <li
                  key={b.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <p className="font-semibold">{b.name}</p>
                  <p className="text-sm text-zinc-500">
                    {[b.city, b.address].filter(Boolean).join(" · ") ||
                      "بدون عنوان"}
                  </p>
                </li>
              ))}
            </ul>
            <div className="rounded-2xl border border-teal-200 bg-teal-50 p-6 text-center dark:border-teal-900 dark:bg-teal-950/40">
              <p className="font-medium text-teal-800 dark:text-teal-200">
                سجّل الدخول لإتمام الحجز
              </p>
              <Link
                href={`/login?redirect=/r/${slug}`}
                className="mt-3 inline-block rounded-lg bg-teal-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700"
              >
                تسجيل الدخول / إنشاء حساب
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
